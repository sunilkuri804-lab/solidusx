import type {
  CoachMessage,
  RoastResult,
  SolanaPaymentQuote,
  SolanaPaymentVerificationResult,
  SolPriceHistory,
  SolPricePoint,
  SubscriptionTier,
  TokenPriceQuote,
  UserProfile,
  WalletAnalysis,
  WalletTransaction,
  WhaleDecodeResult,
  WhatIfResult,
} from '../types';
import {
  claimSupabaseRewardedAd,
  consumeSupabaseScanCredit,
  deleteSupabaseAccount,
  getSupabaseUserProfile,
  loginWithSupabase,
  signUpWithSupabase,
  updateSupabaseTier,
} from './supabaseStore';
import {
  localClaimRewardAd,
  localConsumeScan,
  localDeleteAccount,
  localGetProfile,
  localLogin,
  localSignUp,
  localUpdateTier,
} from './localAuthStore';
import { HELIUS_RPC_URL, isSupabaseConfigured } from './supabase';

const MERCHANT_SOLANA_WALLET = '9XEcqn4CfftDGx3DJLdHgPc7KoF9YPUgeQvHaBztCEt2';
const SOLANA_SIGNATURE_REGEX = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export class ApiError extends Error {
  status: number;
  code?: string;
  profile?: UserProfile;

  constructor(message: string, status: number, code?: string, profile?: UserProfile) {
    super(message);
    this.status = status;
    this.code = code;
    this.profile = profile;
  }
}

async function requestJson<T>(
  url: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const resp = await fetch(url, {
    ...options,
    headers,
  });

  const payload = (await resp.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    profile?: UserProfile;
  };

  if (!resp.ok) {
    throw new ApiError(
      payload.message || payload.error || `Request failed (${resp.status})`,
      resp.status,
      payload.error,
      payload.profile
    );
  }

  return payload as T;
}

// --- Client-Side Direct Public Fallbacks (used if /api/* returns 404 on purely static hosting) ---

async function fetchSolPriceBrowserFallback(): Promise<number> {
  try {
    const resp = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
    );
    if (resp.ok) {
      const json = (await resp.json()) as { solana?: { usd?: number } };
      if (typeof json.solana?.usd === 'number' && json.solana.usd > 0) {
        return json.solana.usd;
      }
    }
  } catch {
    // Fallback below
  }
  return 185;
}

function formatShortDate(tsMs: number): string {
  return new Date(tsMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function fetchSolHistoryBrowserFallback(): Promise<SolPriceHistory> {
  try {
    const resp = await fetch(
      'https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=7'
    );
    if (resp.ok) {
      const json = (await resp.json()) as { prices?: Array<[number, number]> };
      const raw = Array.isArray(json.prices) ? json.prices : [];
      if (raw.length >= 2) {
        const step = Math.max(1, Math.floor(raw.length / 24));
        const points: SolPricePoint[] = [];
        for (let i = 0; i < raw.length; i += step) {
          const [ts, price] = raw[i];
          points.push({ timestamp: ts, label: formatShortDate(ts), price: Math.round(price * 100) / 100 });
        }
        const last = raw[raw.length - 1];
        if (points[points.length - 1]?.timestamp !== last[0]) {
          points.push({ timestamp: last[0], label: formatShortDate(last[0]), price: Math.round(last[1] * 100) / 100 });
        }
        const firstP = points[0].price;
        const currP = points[points.length - 1].price;
        const pct = firstP > 0 ? Math.round(((currP - firstP) / firstP) * 1000) / 10 : 0;
        return { currentPriceUsd: currP, change7dPct: pct, points, source: 'coingecko' };
      }
    }
  } catch {
    // Smooth curve fallback below
  }

  const spot = await fetchSolPriceBrowserFallback();
  const now = Date.now();
  const curve = [-0.032, -0.025, -0.029, -0.018, -0.021, -0.011, -0.014, -0.004, 0.002, -0.006, 0.004, 0.009, 0.003, 0];
  const points: SolPricePoint[] = curve.map((offset, idx) => {
    const ts = now - (curve.length - 1 - idx) * 12 * 60 * 60 * 1000;
    return { timestamp: ts, label: formatShortDate(ts), price: Math.round(spot * (1 + offset) * 100) / 100 };
  });
  const firstP = points[0].price;
  const lastP = points[points.length - 1].price;
  const pct = firstP > 0 ? Math.round(((lastP - firstP) / firstP) * 1000) / 10 : 0;
  return { currentPriceUsd: lastP, change7dPct: pct, points, source: 'cached' };
}

async function rpcPostBrowser<T>(method: string, params: unknown[]): Promise<T> {
  const endpoints = Array.from(
    new Set([
      HELIUS_RPC_URL,
      'https://api.mainnet-beta.solana.com',
      'https://solana-rpc.publicnode.com',
    ])
  );
  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!resp.ok) continue;
      const json = (await resp.json()) as { result?: T; error?: { message?: string } };
      if (!json.error && json.result !== undefined) return json.result;
    } catch {
      continue;
    }
  }
  throw new Error('Unable to reach Solana public RPC nodes right now.');
}

async function analyzeWalletBrowserFallback(walletAddress: string): Promise<WalletAnalysis> {
  if (!BASE58_REGEX.test(walletAddress)) {
    throw new Error('Invalid Solana wallet address.');
  }
  const [solPriceUsd, balRes, sigs] = await Promise.all([
    fetchSolPriceBrowserFallback(),
    rpcPostBrowser<{ value?: number }>('getBalance', [walletAddress]),
    rpcPostBrowser<Array<{ signature: string; blockTime?: number | null; err?: unknown }>>(
      'getSignaturesForAddress',
      [walletAddress, { limit: 50 }]
    ),
  ]);

  const solBalance = (typeof balRes?.value === 'number' ? balRes.value : 0) / 1e9;
  if (!Array.isArray(sigs) || sigs.length === 0) {
    return {
      walletAddress,
      solBalance,
      solPriceUsd,
      totalNetPnlUsd: 0,
      totalNetPnlSol: 0,
      tradesCount: 0,
      winRate: 0,
      totalGasFeesUsd: 0,
      totalGasFeesSol: 0,
      isEmpty: true,
      dataSource: 'solana-rpc',
      topTokens: [],
      recentTransactions: [],
      analyzedAt: new Date().toISOString(),
    };
  }

  let winning = 0;
  const recentTransactions: WalletTransaction[] = sigs.slice(0, 15).map((s) => {
    if (!s.err) winning += 1;
    return {
      signature: s.signature,
      timestamp: (s.blockTime || Math.floor(Date.now() / 1000)) * 1000,
      type: 'TRANSFER',
      solDelta: 0,
      usdDelta: 0,
      feeSol: 0.000005,
      status: s.err ? 'failed' : 'success',
      summary: `Confirmed tx (${s.signature.slice(0, 6)}…)`,
    };
  });

  const tradesCount = sigs.length;
  const gasSol = tradesCount * 0.000005;

  return {
    walletAddress,
    solBalance,
    solPriceUsd,
    totalNetPnlUsd: 0,
    totalNetPnlSol: 0,
    tradesCount,
    winRate: tradesCount > 0 ? Math.round((winning / Math.min(tradesCount, 15)) * 1000) / 10 : 0,
    totalGasFeesUsd: gasSol * solPriceUsd,
    totalGasFeesSol: gasSol,
    isEmpty: false,
    dataSource: 'solana-rpc',
    topTokens: [],
    recentTransactions,
    analyzedAt: new Date().toISOString(),
  };
}

// --- Auth & Supabase Profiles ---

export async function signUpEmail(email: string, password: string) {
  if (isSupabaseConfigured) {
    return signUpWithSupabase(email, password);
  }
  try {
    return await requestJson<{ token: string; profile: UserProfile }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return localSignUp(email, password);
    }
    throw err;
  }
}

export async function loginEmail(email: string, password: string) {
  if (isSupabaseConfigured) {
    return loginWithSupabase(email, password);
  }
  try {
    return await requestJson<{ token: string; profile: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return localLogin(email, password);
    }
    throw err;
  }
}

export async function fetchProfile(token: string) {
  if (isSupabaseConfigured) {
    const res = await getSupabaseUserProfile();
    return { profile: res.profile };
  }
  if (token.startsWith('local.')) {
    const profile = localGetProfile(token);
    if (!profile) throw new ApiError('Session expired.', 401);
    return { profile };
  }
  return requestJson<{ profile: UserProfile }>('/api/auth/me', { method: 'GET' }, token);
}

export async function upgradeTier(token: string, tier: SubscriptionTier) {
  if (isSupabaseConfigured) {
    if (tier !== 'Free') {
      throw new ApiError(
        'Upgrading to Pro or Super requires a verified Solana transaction signature.',
        402,
        'PAYMENT_REQUIRED'
      );
    }
    const profile = await updateSupabaseTier('Free');
    return { profile };
  }
  if (token.startsWith('local.')) {
    if (tier !== 'Free') {
      throw new ApiError(
        'Upgrading to Pro or Super requires a verified Solana transaction signature.',
        402,
        'PAYMENT_REQUIRED'
      );
    }
    return { profile: localUpdateTier(token, 'Free') };
  }
  return requestJson<{ profile: UserProfile }>(
    '/api/auth/upgrade',
    {
      method: 'POST',
      body: JSON.stringify({ tier }),
    },
    token
  );
}

export async function claimRewardedAdScan(token: string) {
  if (isSupabaseConfigured) {
    try {
      const profile = await claimSupabaseRewardedAd();
      return { profile };
    } catch (err) {
      const e = err as Error & { code?: string; profile?: UserProfile };
      throw new ApiError(e.message, e.code === 'AD_LIMIT_REACHED' ? 403 : 400, e.code, e.profile);
    }
  }
  if (token.startsWith('local.')) {
    try {
      return { profile: localClaimRewardAd(token) };
    } catch (err) {
      const e = err as Error & { code?: string; profile?: UserProfile };
      throw new ApiError(e.message, e.code === 'AD_LIMIT_REACHED' ? 403 : 400, e.code, e.profile);
    }
  }
  return requestJson<{ profile: UserProfile }>(
    '/api/auth/reward-ad',
    { method: 'POST' },
    token
  );
}

export async function deleteAccount(token: string) {
  if (isSupabaseConfigured) {
    await deleteSupabaseAccount();
    return { deleted: true };
  }
  if (token.startsWith('local.')) {
    localDeleteAccount(token);
    return { deleted: true };
  }
  return requestJson<{ deleted: boolean }>('/api/auth/account', { method: 'DELETE' }, token);
}

// --- Solana Wallet Analyzer ---

export async function analyzeWallet(token: string, walletAddress: string) {
  const cleaned = walletAddress.trim();

  if (isSupabaseConfigured || token.startsWith('local.')) {
    const currentProfile = isSupabaseConfigured
      ? (await getSupabaseUserProfile()).profile
      : localGetProfile(token);

    if (!currentProfile) {
      throw new ApiError('Session expired. Please sign in again.', 401);
    }

    const hasDaily =
      currentProfile.dailyLimit === null || currentProfile.dailyChecks < currentProfile.dailyLimit;
    const hasBonus = currentProfile.bonusChecks > 0;

    if (!hasDaily && !hasBonus) {
      const adCapReached =
        currentProfile.tier === 'Free' && currentProfile.adScansToday >= 2;
      throw new ApiError(
        adCapReached
          ? 'Daily Limit Reached — Upgrade to Pro'
          : 'Daily free scan limit reached. Upgrade to Pro or watch a short ad for +1 free scan.',
        402,
        'DAILY_LIMIT_REACHED',
        currentProfile
      );
    }

    let analysis: WalletAnalysis;
    try {
      const res = await requestJson<{ analysis: WalletAnalysis }>(
        '/api/solana/analyze',
        {
          method: 'POST',
          body: JSON.stringify({ walletAddress: cleaned }),
        },
        token
      );
      analysis = res.analysis;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 401)) {
        analysis = await analyzeWalletBrowserFallback(cleaned);
      } else {
        throw err;
      }
    }

    const updatedProfile =
      !analysis.isEmpty && analysis.tradesCount > 0
        ? isSupabaseConfigured
          ? await consumeSupabaseScanCredit()
          : localConsumeScan(token)
        : currentProfile;

    return { analysis, profile: updatedProfile };
  }

  return requestJson<{ analysis: WalletAnalysis; profile: UserProfile }>(
    '/api/solana/analyze',
    {
      method: 'POST',
      body: JSON.stringify({ walletAddress: cleaned }),
    },
    token
  );
}

// --- 4 AI Tools ---

export async function generateRoast(token: string, walletContext: WalletAnalysis | null) {
  return requestJson<RoastResult>(
    '/api/ai/roast',
    {
      method: 'POST',
      body: JSON.stringify({ walletContext }),
    },
    token
  );
}

export async function generateWhatIf(token: string, walletContext: WalletAnalysis | null) {
  return requestJson<WhatIfResult>(
    '/api/ai/what-if',
    {
      method: 'POST',
      body: JSON.stringify({ walletContext }),
    },
    token
  );
}

export async function decodeWhaleWallet(token: string, targetWalletAddress: string) {
  return requestJson<WhaleDecodeResult>(
    '/api/ai/whale-decode',
    {
      method: 'POST',
      body: JSON.stringify({ targetWalletAddress: targetWalletAddress.trim() }),
    },
    token
  );
}

export async function sendCoachMessage(
  token: string,
  walletContext: WalletAnalysis | null,
  messages: CoachMessage[],
  message: string
) {
  return requestJson<{ reply: string; cached?: boolean; expiresAt?: number }>(
    '/api/ai/coach',
    {
      method: 'POST',
      body: JSON.stringify({
        walletContext,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        message,
      }),
    },
    token
  );
}

// --- 7-Day SOL History & Live Token Prices ---

export async function fetchSolHistory(): Promise<SolPriceHistory> {
  try {
    return await requestJson<SolPriceHistory>('/api/solana/sol-history', { method: 'GET' });
  } catch {
    return fetchSolHistoryBrowserFallback();
  }
}

export async function fetchTokenPrices(mints: string[]): Promise<Record<string, TokenPriceQuote>> {
  const unique = Array.from(
    new Set(mints.map((m) => m.trim()).filter((m) => BASE58_REGEX.test(m)))
  ).slice(0, 25);
  if (unique.length === 0) return {};

  try {
    const res = await requestJson<{ prices: Record<string, TokenPriceQuote> }>(
      `/api/solana/token-prices?mints=${encodeURIComponent(unique.join(','))}`,
      { method: 'GET' }
    );
    if (res && res.prices) return res.prices;
  } catch {
    // Fall back to direct browser DexScreener + CoinGecko fetch
  }

  const prices: Record<string, TokenPriceQuote> = {};
  try {
    const resp = await fetch(
      `https://api.dexscreener.com/tokens/v1/solana/${unique.join(',')}`
    );
    if (resp.ok) {
      const pairs = (await resp.json()) as Array<{
        baseToken?: { address?: string; symbol?: string };
        priceUsd?: string;
        priceChange?: { h24?: number };
        liquidity?: { usd?: number };
      }>;
      if (Array.isArray(pairs)) {
        const bestLiq = new Map<string, number>();
        for (const pair of pairs) {
          const addr = pair.baseToken?.address || '';
          const price = Number(pair.priceUsd);
          const liq = Number(pair.liquidity?.usd || 0);
          if (!addr || !unique.includes(addr) || !(price > 0)) continue;
          if (liq > (bestLiq.get(addr) ?? -1)) {
            bestLiq.set(addr, liq);
            prices[addr] = {
              mint: addr,
              symbol: pair.baseToken?.symbol || `${addr.slice(0, 4)}…${addr.slice(-4)}`,
              priceUsd: price,
              change24hPct:
                typeof pair.priceChange?.h24 === 'number' ? pair.priceChange.h24 : null,
            };
          }
        }
      }
    }
  } catch {
    // Fallback below
  }

  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

  if (unique.includes(SOL_MINT) && !prices[SOL_MINT]) {
    prices[SOL_MINT] = {
      mint: SOL_MINT,
      symbol: 'SOL',
      priceUsd: await fetchSolPriceBrowserFallback(),
      change24hPct: null,
    };
  }
  if (unique.includes(USDC_MINT) && !prices[USDC_MINT]) {
    prices[USDC_MINT] = { mint: USDC_MINT, symbol: 'USDC', priceUsd: 1, change24hPct: 0 };
  }
  if (unique.includes(USDT_MINT) && !prices[USDT_MINT]) {
    prices[USDT_MINT] = { mint: USDT_MINT, symbol: 'USDT', priceUsd: 1, change24hPct: 0 };
  }

  return prices;
}

// --- Solana Crypto Payments ---

export async function fetchSolanaPaymentQuote(token: string): Promise<SolanaPaymentQuote> {
  try {
    return await requestJson<SolanaPaymentQuote>('/api/payments/quote', { method: 'GET' }, token);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 401)) {
      const solPriceUsd = await fetchSolPriceBrowserFallback();
      const toSol = (usd: number) => Math.ceil((usd / solPriceUsd) * 10000) / 10000;
      return {
        merchantWallet: MERCHANT_SOLANA_WALLET,
        solPriceUsd,
        quotes: {
          Pro: { monthly: { usd: 19, sol: toSol(19) } },
          Super: {
            monthly: { usd: 89, sol: toSol(89) },
            annual: { usd: 1099, sol: toSol(1099) },
          },
        },
      };
    }
    throw err;
  }
}

export async function verifySolanaPayment(
  token: string,
  payload: { signature: string; tier: 'Pro' | 'Super'; billing: 'monthly' | 'annual' }
): Promise<SolanaPaymentVerificationResult> {
  const sig = payload.signature.trim();
  if (!SOLANA_SIGNATURE_REGEX.test(sig)) {
    throw new Error('Invalid Solana transaction signature format. Please paste the full Base58 Tx Hash.');
  }

  try {
    const res = await requestJson<
      Partial<SolanaPaymentVerificationResult> & {
        verified: boolean;
        signature: string;
        solReceived: number;
        usdValue: number;
        supabaseSynced: boolean;
      }
    >(
      '/api/payments/verify-solana',
      {
        method: 'POST',
        body: JSON.stringify({ ...payload, signature: sig }),
      },
      token
    );

    const profile = isSupabaseConfigured
      ? await updateSupabaseTier(payload.tier)
      : token.startsWith('local.')
        ? localUpdateTier(token, payload.tier)
        : res.profile!;

    return {
      verified: Boolean(res.verified),
      signature: res.signature,
      solReceived: Number(res.solReceived ?? 0),
      usdValue: Number(res.usdValue ?? 0),
      supabaseSynced: Boolean(res.supabaseSynced || isSupabaseConfigured),
      profile,
    };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 401)) {
      // Browser RPC fallback if /api/* is unavailable or unauthenticated on purely static host
      const tx = await rpcPostBrowser<{
        meta?: { err?: unknown; preBalances?: number[]; postBalances?: number[] };
        transaction?: { message?: { accountKeys?: Array<string | { pubkey?: string }> } };
      } | null>('getTransaction', [
        sig,
        { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
      ]);

      if (!tx) {
        throw new Error(
          'Transaction not found on Solana mainnet RPC yet. Please wait a few seconds and try again.'
        );
      }
      if (tx.meta?.err !== null && tx.meta?.err !== undefined) {
        throw new Error('This Solana transaction failed on-chain.');
      }
      const keys = (tx.transaction?.message?.accountKeys || []).map((k) =>
        typeof k === 'string' ? k : k?.pubkey || ''
      );
      const idx = keys.indexOf(MERCHANT_SOLANA_WALLET);
      const solReceived =
        idx >= 0 && tx.meta?.preBalances && tx.meta?.postBalances
          ? Math.max(0, (tx.meta.postBalances[idx] - tx.meta.preBalances[idx]) / 1e9)
          : 0;
      const solPriceUsd = await fetchSolPriceBrowserFallback();
      const expectedUsd =
        payload.tier === 'Pro' ? 19 : payload.billing === 'annual' ? 1099 : 89;
      if (solReceived * solPriceUsd < expectedUsd * 0.9) {
        throw new Error(
          `Insufficient SOL received at merchant wallet (${MERCHANT_SOLANA_WALLET.slice(0, 6)}…).`
        );
      }
      const profile = isSupabaseConfigured
        ? await updateSupabaseTier(payload.tier)
        : localUpdateTier(token, payload.tier);
      return {
        verified: true,
        signature: sig,
        solReceived,
        usdValue: Math.round(solReceived * solPriceUsd * 100) / 100,
        supabaseSynced: isSupabaseConfigured,
        profile,
      };
    }
    throw err;
  }
}
