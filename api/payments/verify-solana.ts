import {
  authenticateRequest,
  fetchSolPriceUsd,
  getSupabaseConfig,
  MERCHANT_SOLANA_WALLET,
  SOLANA_SIGNATURE_REGEX,
  verifySolanaPaymentOnRpc,
  type ApiRequest,
  type ApiResponse,
} from '../_shared.js';
import type { SubscriptionTier } from '../../src/types';

function getPlanUsdPrice(tier: 'Pro' | 'Super', billing: 'monthly' | 'annual'): number {
  if (tier === 'Pro') return 19;
  return billing === 'annual' ? 1099 : 89;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const caller = await authenticateRequest(req);
  if (!caller) {
    res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
    return;
  }

  const rawSig = typeof req.body?.signature === 'string' ? req.body.signature.trim() : '';
  const tier = req.body?.tier as SubscriptionTier;
  const billing: 'monthly' | 'annual' = req.body?.billing === 'annual' ? 'annual' : 'monthly';

  if (tier !== 'Pro' && tier !== 'Super') {
    res.status(400).json({ error: 'Select Pro or Super plan to verify payment.' });
    return;
  }
  if (!SOLANA_SIGNATURE_REGEX.test(rawSig)) {
    res.status(400).json({
      error: 'Invalid Solana transaction signature format. Please paste the full Base58 Tx Hash.',
    });
    return;
  }

  const { url, serviceKey } = getSupabaseConfig();

  // Check optional used_payment_signatures table in Supabase for cross-invocation replay protection
  if (url && serviceKey) {
    try {
      const checkResp = await fetch(
        `${url}/rest/v1/used_payment_signatures?signature=eq.${encodeURIComponent(rawSig)}&select=signature`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          signal: AbortSignal.timeout(5000),
        }
      );
      if (checkResp.ok) {
        const existing = (await checkResp.json()) as Array<{ signature?: string }>;
        if (existing.length > 0) {
          res.status(409).json({
            error: 'This Solana transaction signature has already been used to activate a plan.',
          });
          return;
        }
      }
    } catch {
      // Optional table not provisioned
    }
  }

  try {
    const [solPriceUsd, txResult] = await Promise.all([
      fetchSolPriceUsd(),
      verifySolanaPaymentOnRpc(rawSig),
    ]);

    if (!txResult.found) {
      res.status(400).json({
        error:
          'Transaction not found on Solana mainnet RPC yet. Please wait a few seconds for confirmation and click Verify & Activate Plan again.',
      });
      return;
    }

    if (!txResult.succeeded) {
      res.status(400).json({
        error: 'This Solana transaction failed on-chain and cannot activate a subscription.',
      });
      return;
    }

    const expectedUsd = getPlanUsdPrice(tier, billing);
    const expectedSol = Math.round((expectedUsd / solPriceUsd) * 10000) / 10000;
    const receivedUsd = txResult.solReceived * solPriceUsd + txResult.stablecoinReceivedUsd;

    if (receivedUsd < expectedUsd * 0.9) {
      res.status(400).json({
        error: `Insufficient payment received at merchant wallet (${MERCHANT_SOLANA_WALLET.slice(0, 6)}…${MERCHANT_SOLANA_WALLET.slice(-4)}). Expected ~${expectedSol} SOL ($${expectedUsd} USD).`,
      });
      return;
    }

    let supabaseSynced = false;
    if (url && serviceKey) {
      await fetch(`${url}/rest/v1/used_payment_signatures`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          signature: rawSig,
          user_id: caller.id,
          tier,
          billing,
          verified_at: new Date().toISOString(),
        }),
      }).catch(() => undefined);

      const patchResp = await fetch(
        `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(caller.id)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ tier, updated_at: new Date().toISOString() }),
        }
      ).catch(() => null);

      supabaseSynced = Boolean(patchResp?.ok);
    }

    res.status(200).json({
      verified: true,
      signature: rawSig,
      solReceived: txResult.solReceived,
      usdValue: Math.round(receivedUsd * 100) / 100,
      supabaseSynced,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unable to verify Solana transaction on RPC.';
    res.status(502).json({ error: message });
  }
}
