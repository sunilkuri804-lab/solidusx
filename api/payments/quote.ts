import {
  authenticateRequest,
  fetchSolPriceUsd,
  MERCHANT_SOLANA_WALLET,
  type ApiRequest,
  type ApiResponse,
} from '../_shared.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const caller = await authenticateRequest(req);
  if (!caller) {
    res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
    return;
  }

  const solPriceUsd = await fetchSolPriceUsd();
  const toSol = (usd: number) => Math.ceil((usd / solPriceUsd) * 10000) / 10000;

  res.status(200).json({
    merchantWallet: MERCHANT_SOLANA_WALLET,
    solPriceUsd,
    quotes: {
      Pro: {
        monthly: { usd: 19, sol: toSol(19) },
      },
      Super: {
        monthly: { usd: 89, sol: toSol(89) },
        annual: { usd: 1099, sol: toSol(1099) },
      },
    },
  });
}
