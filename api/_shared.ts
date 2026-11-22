import { GoogleGenAI } from '@google/genai';
import type {
  SolPriceHistory,
  SolPricePoint,
  SubscriptionTier,
  TokenPriceQuote,
  TokenSummary,
  WalletAnalysis,
  WalletTransaction,
} from '../src/types';

export interface ApiRequest {
  method?: string;
  body?: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

export const MERCHANT_SOLANA_WALLET = '9XEcqn4CfftDGx3DJLdHgPc7KoF9YPUgeQvHaBztCEt2';
export const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const SOLANA_SIGNATURE_REGEX = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

const KNOWN_TOKENS: Record<string, string> = {
  So11111111111111111111111111111111111111112: 'SOL',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'USDT',
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 'JUP',
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 'BONK',
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: 'WIF',
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'RAY',
  jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL: 'JTO',
  HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: 'PYTH',
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: 'mSOL',
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: 'bSOL',
};

export function getEnv(name: string): string {
  return (process.env[name] || '').trim();
}

export function getSupabaseConfig() {
  const url = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
  const anonKey = getEnv('SUPABASE_ANON_KEY') || getEnv('VITE_SUPABASE_ANON_KEY');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  return { url: url.replace(/\/$/, ''), anonKey, serviceKey };
}

export interface VerifiedCaller {
  id: string;
  email: string;
  tier: SubscriptionTier;
}

export async function authenticateRequest(req: ApiRequest): Promise<VerifiedCaller | null> {
  const authRaw = req.headers.authorization;
  const authHeader = Array.isArray(authRaw) ? authRaw[0] || '' : authRaw || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;

  try {
    const userResp = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!userResp.ok) return null;

    const sbUser = (await userResp.json()) as {
      id?: string;
      email?: string;
      user_metadata?: { tier?: unknown };
    };
    if (!sbUser?.id) return null;

    let tier: SubscriptionTier = 'Free';
    const metaTier = sbUser.user_metadata?.tier;
    if (metaTier === 'Pro' || metaTier === 'Super') tier = metaTier;

    // Check public.profiles table as authoritative source when available
    try {
      const profResp = await fetch(
        `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(sbUser.id)}&select=tier`,
        {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(5000),
        }
      );
      if (profResp.ok) {
        const rows = (await profResp.json()) as Array<{ tier?: string }>;
        const dbTier = rows?.[0]?.tier;
        if (dbTier === 'Pro' || dbTier === 'Super' || dbTier === 'Free') {
          tier = dbTier;
        }
      }
    } catch {
      // Fall back to user_metadata.tier
    }

    return {
      id: sbUser.id,
      email: sbUser.email || '',
      tier,
    };
  } catch {
    return null;
  }
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = getEnv('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing in environment configuration.');
  }
  return new GoogleGenAI({ apiKey });
}

export async function fetchSolPriceUsd(): Promise<number> {
  try {
    const resp = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { signal: AbortSignal.timeout(5000) }
    );
    if (resp.ok) {
      const data = (await resp.json()) as { solana?: { usd?: number } };
      const price = data?.solana?.usd;
      if (typeof price === 'number' && price > 0) return price;
    }
  } catch {
    // Fallback below
  }
  return 185;
}

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

export async function fetchSolanaTokenPrices(
  rawMints: string[]
): Promise<Record<string, TokenPriceQuote>> {
  const uniqueMints = Array.from(
    new Set(rawMints.map((m) => m.trim()).filter((m) => BASE58_REGEX.test(m)))
  ).slice(0, 25);

  const quotes: Record<string, TokenPriceQuote> = {};
  if (uniqueMints.length === 0) return quotes;

  // Query DexScreener for all requested Solana token mints in one call
  try {
    const resp = await fetch(
      `https://api.dexscreener.com/tokens/v1/solana/${uniqueMints.join(',')}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (resp.ok) {
      const pairs = (await resp.json()) as Array<{
        baseToken?: { address?: string; symbol?: string };
        priceUsd?: string;
        priceChange?: { h24?: number };
        liquidity?: { usd?: number };
      }>;

      if (Array.isArray(pairs)) {
        const bestLiquidity = new Map<string, number>();
        for (const pair of pairs) {
          const addr = pair.baseToken?.address || '';
          const price = Number(pair.priceUsd);
          const liq = Number(pair.liquidity?.usd || 0);
          if (!addr || !uniqueMints.includes(addr) || !(price > 0)) continue;
          const prevLiq = bestLiquidity.get(addr) ?? -1;
          if (liq > prevLiq) {
            bestLiquidity.set(addr, liq);
            quotes[addr] = {
              mint: addr,
              symbol: pair.baseToken?.symbol || KNOWN_TOKENS[addr] || `${addr.slice(0, 4)}…${addr.slice(-4)}`,
              priceUsd: price,
              change24hPct:
                typeof pair.priceChange?.h24 === 'number' ? pair.priceChange.h24 : null,
            };
          }
        }
      }
    }
  } catch {
    // Fallback below for SOL and stablecoins
  }

  if (uniqueMints.includes(SOL_MINT) && !quotes[SOL_MINT]) {
    const solSpot = await fetchSolPriceUsd();
    quotes[SOL_MINT] = {
      mint: SOL_MINT,
      symbol: 'SOL',
      priceUsd: solSpot,
      change24hPct: null,
    };
  }
  if (uniqueMints.includes(USDC_MINT) && !quotes[USDC_MINT]) {
    quotes[USDC_MINT] = { mint: USDC_MINT, symbol: 'USDC', priceUsd: 1, change24hPct: 0 };
  }
  if (uniqueMints.includes(USDT_MINT) && !quotes[USDT_MINT]) {
    quotes[USDT_MINT] = { mint: USDT_MINT, symbol: 'USDT', priceUsd: 1, change24hPct: 0 };
  }

  return quotes;
}

function formatShortDateLabel(tsMs: number): string {
  return new Date(tsMs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export async function fetchSol7DayHistory(): Promise<SolPriceHistory> {
  // Primary: CoinGecko 7-day market chart
  try {
    const resp = await fetch(
      'https://api.coingecko.com/api/v3/coins/solana/market_chart?vs_currency=usd&days=7',
      { signal: AbortSignal.timeout(6000) }
    );
    if (resp.ok) {
      const json = (await resp.json()) as { prices?: Array<[number, number]> };
      const rawPrices = Array.isArray(json.prices) ? json.prices : [];
      if (rawPrices.length >= 2) {
        const step = Math.max(1, Math.floor(rawPrices.length / 24));
        const sampled: SolPricePoint[] = [];
        for (let i = 0; i < rawPrices.length; i += step) {
          const [ts, price] = rawPrices[i];
          sampled.push({
            timestamp: ts,
            label: formatShortDateLabel(ts),
            price: Math.round(price * 100) / 100,
          });
        }
        const lastRaw = rawPrices[rawPrices.length - 1];
        if (sampled[sampled.length - 1]?.timestamp !== lastRaw[0]) {
          sampled.push({
            timestamp: lastRaw[0],
            label: formatShortDateLabel(lastRaw[0]),
            price: Math.round(lastRaw[1] * 100) / 100,
          });
        }
        const first = sampled[0].price;
        const current = sampled[sampled.length - 1].price;
        const change7dPct = first > 0 ? Math.round(((current - first) / first) * 1000) / 10 : 0;
        return { currentPriceUsd: current, change7dPct, points: sampled, source: 'coingecko' };
      }
    }
  } catch {
    // Try Kraken fallback
  }

  // Secondary: Kraken public 4h OHLC
  try {
    const sinceSec = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    const resp = await fetch(
      `https://api.kraken.com/0/public/OHLC?pair=SOLUSD&interval=240&since=${sinceSec}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (resp.ok) {
      const json = (await resp.json()) as {
        result?: Record<string, Array<[number, string, string, string, string]>>;
      };
      const pairKey = Object.keys(json.result || {}).find((k) => k !== 'last');
      const candles = pairKey ? json.result?.[pairKey] : undefined;
      if (Array.isArray(candles) && candles.length >= 2) {
        const sampled: SolPricePoint[] = candles.slice(-28).map((c) => {
          const tsMs = Number(c[0]) * 1000;
          return {
            timestamp: tsMs,
            label: formatShortDateLabel(tsMs),
            price: Math.round(Number(c[4]) * 100) / 100,
          };
        });
        const first = sampled[0].price;
        const current = sampled[sampled.length - 1].price;
        const change7dPct = first > 0 ? Math.round(((current - first) / first) * 1000) / 10 : 0;
        return { currentPriceUsd: current, change7dPct, points: sampled, source: 'kraken' };
      }
    }
  } catch {
    // Fallback curve below
  }

  const fallbackPrice = await fetchSolPriceUsd();
  const now = Date.now();
  const curve = [-0.032, -0.025, -0.029, -0.018, -0.021, -0.011, -0.014, -0.004, 0.002, -0.006, 0.004, 0.009, 0.003, 0];
  const points: SolPricePoint[] = curve.map((offset, idx) => {
    const ts = now - (curve.length - 1 - idx) * 12 * 60 * 60 * 1000;
    return {
      timestamp: ts,
      label: formatShortDateLabel(ts),
      price: Math.round(fallbackPrice * (1 + offset) * 100) / 100,
    };
  });
  const first = points[0].price;
  const last = points[points.length - 1].price;
  const change7dPct = first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : 0;
  return { currentPriceUsd: last, change7dPct, points, source: 'cached' };
}

export function getRpcEndpoints(): string[] {
  const heliusKey = getEnv('HELIUS_API_KEY');
  const list: string[] = [];
  if (heliusKey) {
    list.push(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(heliusKey)}`);
  }
  list.push('https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com');
  return list;
}

export async function rpcCall<T>(endpoint: string, method: string, params: unknown[]): Promise<T> {
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const json = (await resp.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message || 'RPC error');
  return json.result as T;
}

async function rpcBatchGetTransactions(
  endpoint: string,
  signatures: string[]
): Promise<Array<Record<string, unknown> | null>> {
  if (signatures.length === 0) return [];
  const payload = signatures.map((sig, idx) => ({
    jsonrpc: '2.0',
    id: idx + 1,
    method: 'getTransaction',
    params: [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
  }));
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`RPC batch HTTP ${resp.status}`);
  const json = (await resp.json()) as Array<{ id: number; result?: Record<string, unknown> | null }>;
  if (!Array.isArray(json)) return [];
  json.sort((a, b) => a.id - b.id);
  return json.map((item) => item.result ?? null);
}

function shortenMint(mint: string): string {
  return KNOWN_TOKENS[mint] || `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

async function fetchSolBalance(address: string): Promise<number> {
  for (const endpoint of getRpcEndpoints()) {
    try {
      const result = await rpcCall<{ value?: number }>(endpoint, 'getBalance', [address]);
      return (typeof result?.value === 'number' ? result.value : 0) / 1e9;
    } catch {
      continue;
    }
  }
  return 0;
}

interface HeliusTx {
  signature?: string;
  timestamp?: number;
  type?: string;
  fee?: number;
  feePayer?: string;
  description?: string;
  transactionError?: unknown;
  nativeTransfers?: Array<{ fromUserAccount?: string; toUserAccount?: string; amount?: number }>;
  tokenTransfers?: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    tokenAmount?: number;
    mint?: string;
  }>;
  events?: { swap?: unknown };
}

export async function analyzeSolanaWalletOnChain(address: string): Promise<WalletAnalysis> {
  const [solPriceUsd, solBalance] = await Promise.all([
    fetchSolPriceUsd(),
    fetchSolBalance(address),
  ]);
  const heliusKey = getEnv('HELIUS_API_KEY');

  if (heliusKey) {
    try {
      const heliusUrl = `https://api.helius.xyz/v0/addresses/${encodeURIComponent(address)}/transactions?api-key=${encodeURIComponent(heliusKey)}&limit=50`;
      const resp = await fetch(heliusUrl, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const txs = (await resp.json()) as HeliusTx[];
        if (Array.isArray(txs)) {
          if (txs.length === 0) {
            return {
              walletAddress: address,
              solBalance,
              solPriceUsd,
              totalNetPnlUsd: 0,
              totalNetPnlSol: 0,
              tradesCount: 0,
              winRate: 0,
              totalGasFeesUsd: 0,
              totalGasFeesSol: 0,
              isEmpty: true,
              dataSource: 'helius-enhanced',
              topTokens: [],
              recentTransactions: [],
              analyzedAt: new Date().toISOString(),
            };
          }

          let totalNetPnlSol = 0;
          let totalGasFeesSol = 0;
          let tradesCount = 0;
          let winningTrades = 0;
          const tokenMap = new Map<string, { netChange: number; txCount: number }>();
          const recentTransactions: WalletTransaction[] = [];

          for (const tx of txs) {
            const feeSol = tx.feePayer === address ? (tx.fee || 0) / 1e9 : 0;
            totalGasFeesSol += feeSol;

            let solDelta = 0;
            for (const nt of tx.nativeTransfers || []) {
              const amt = (nt.amount || 0) / 1e9;
              if (nt.toUserAccount === address) solDelta += amt;
              if (nt.fromUserAccount === address) solDelta -= amt;
            }

            let touchedTokens = false;
            for (const tt of tx.tokenTransfers || []) {
              if (!tt.mint) continue;
              const amt = Number(tt.tokenAmount || 0);
              if (tt.toUserAccount === address || tt.fromUserAccount === address) {
                touchedTokens = true;
                const entry = tokenMap.get(tt.mint) || { netChange: 0, txCount: 0 };
                if (tt.toUserAccount === address) entry.netChange += amt;
                if (tt.fromUserAccount === address) entry.netChange -= amt;
                entry.txCount += 1;
                tokenMap.set(tt.mint, entry);
              }
            }

            const isSwapOrTransfer =
              tx.type === 'SWAP' ||
              Boolean(tx.events?.swap) ||
              tx.type === 'TRANSFER' ||
              Math.abs(solDelta) > 0 ||
              touchedTokens;

            if (isSwapOrTransfer) {
              tradesCount += 1;
              if (solDelta > 0 || (solDelta >= 0 && touchedTokens)) {
                winningTrades += 1;
              }
            }

            totalNetPnlSol += solDelta;
            const kind: WalletTransaction['type'] =
              tx.type === 'SWAP' || tx.events?.swap
                ? 'SWAP'
                : tx.type === 'TRANSFER' || Math.abs(solDelta) > 0 || touchedTokens
                  ? 'TRANSFER'
                  : 'CONTRACT';

            if (recentTransactions.length < 15) {
              recentTransactions.push({
                signature: tx.signature || 'unknown',
                timestamp: (tx.timestamp || Math.floor(Date.now() / 1000)) * 1000,
                type: kind,
                solDelta,
                usdDelta: solDelta * solPriceUsd,
                feeSol,
                status: tx.transactionError ? 'failed' : 'success',
                summary:
                  tx.description ||
                  `${kind === 'SWAP' ? 'Token swap' : 'On-chain transfer'} (${solDelta >= 0 ? '+' : ''}${solDelta.toFixed(4)} SOL)`,
              });
            }
          }

          const topTokens: TokenSummary[] = Array.from(tokenMap.entries())
            .map(([mint, info]) => ({
              mint,
              symbol: shortenMint(mint),
              netChange: info.netChange,
              txCount: info.txCount,
            }))
            .sort((a, b) => b.txCount - a.txCount)
            .slice(0, 6);

          return {
            walletAddress: address,
            solBalance,
            solPriceUsd,
            totalNetPnlUsd: totalNetPnlSol * solPriceUsd,
            totalNetPnlSol,
            tradesCount,
            winRate: tradesCount > 0 ? Math.round((winningTrades / tradesCount) * 1000) / 10 : 0,
            totalGasFeesUsd: totalGasFeesSol * solPriceUsd,
            totalGasFeesSol,
            isEmpty: false,
            dataSource: 'helius-enhanced',
            topTokens,
            recentTransactions,
            analyzedAt: new Date().toISOString(),
          };
        }
      }
    } catch {
      // Fall back to standard RPC below
    }
  }

  for (const endpoint of getRpcEndpoints()) {
    try {
      const sigInfos = await rpcCall<
        Array<{ signature: string; blockTime?: number | null; err?: unknown }>
      >(endpoint, 'getSignaturesForAddress', [address, { limit: 50 }]);

      if (!Array.isArray(sigInfos) || sigInfos.length === 0) {
        return {
          walletAddress: address,
          solBalance,
          solPriceUsd,
          totalNetPnlUsd: 0,
          totalNetPnlSol: 0,
          tradesCount: 0,
          winRate: 0,
          totalGasFeesUsd: 0,
          totalGasFeesSol: 0,
          isEmpty: true,
          dataSource: endpoint.includes('helius-rpc.com') ? 'helius-rpc' : 'solana-rpc',
          topTokens: [],
          recentTransactions: [],
          analyzedAt: new Date().toISOString(),
        };
      }

      const detailSigs = sigInfos.slice(0, 20).map((s) => s.signature);
      let txDetails: Array<Record<string, unknown> | null> = [];
      try {
        txDetails = await rpcBatchGetTransactions(endpoint, detailSigs);
      } catch {
        txDetails = [];
      }

      let totalNetPnlSol = 0;
      let totalGasFeesSol = 0;
      let tradesCount = 0;
      let winningTrades = 0;
      const tokenMap = new Map<string, { netChange: number; txCount: number }>();
      const recentTransactions: WalletTransaction[] = [];

      for (let i = 0; i < sigInfos.length; i++) {
        const sigInfo = sigInfos[i];
        const detail = i < txDetails.length ? txDetails[i] : null;
        let solDelta = 0;
        let feeSol = 0;
        let touchedTokens = false;
        let isSwapHeuristic = false;

        if (detail) {
          const meta = detail.meta as {
            err?: unknown;
            fee?: number;
            preBalances?: number[];
            postBalances?: number[];
            preTokenBalances?: Array<{ owner?: string; mint?: string; uiTokenAmount?: { uiAmount?: number | null } }>;
            postTokenBalances?: Array<{ owner?: string; mint?: string; uiTokenAmount?: { uiAmount?: number | null } }>;
          } | null;

          const message = (detail.transaction as {
            message?: { accountKeys?: Array<string | { pubkey?: string }> };
          } | null)?.message;

          const keys = (message?.accountKeys || []).map((k) =>
            typeof k === 'string' ? k : k?.pubkey || ''
          );
          const ownerIdx = keys.indexOf(address);

          if (ownerIdx === 0 && meta?.fee) feeSol = meta.fee / 1e9;
          if (ownerIdx >= 0 && meta?.preBalances && meta?.postBalances) {
            solDelta = (meta.postBalances[ownerIdx] - meta.preBalances[ownerIdx]) / 1e9;
          }

          const preTokens = new Map<string, number>();
          for (const tb of meta?.preTokenBalances || []) {
            if (tb.owner === address && tb.mint) {
              preTokens.set(tb.mint, (preTokens.get(tb.mint) || 0) + Number(tb.uiTokenAmount?.uiAmount || 0));
            }
          }
          const postTokens = new Map<string, number>();
          for (const tb of meta?.postTokenBalances || []) {
            if (tb.owner === address && tb.mint) {
              postTokens.set(tb.mint, (postTokens.get(tb.mint) || 0) + Number(tb.uiTokenAmount?.uiAmount || 0));
            }
          }
          const allMints = new Set([...preTokens.keys(), ...postTokens.keys()]);
          for (const mint of allMints) {
            const diff = (postTokens.get(mint) || 0) - (preTokens.get(mint) || 0);
            if (Math.abs(diff) > 0) {
              touchedTokens = true;
              const entry = tokenMap.get(mint) || { netChange: 0, txCount: 0 };
              entry.netChange += diff;
              entry.txCount += 1;
              tokenMap.set(mint, entry);
            }
          }
          if (allMints.size >= 2 || (touchedTokens && Math.abs(solDelta) > 0.0005)) {
            isSwapHeuristic = true;
          }
        }

        if (!detail || isSwapHeuristic || Math.abs(solDelta) > 0 || touchedTokens) {
          tradesCount += 1;
          if (solDelta > 0 || (!detail && !sigInfo.err)) {
            winningTrades += 1;
          }
        }

        totalNetPnlSol += solDelta;
        totalGasFeesSol += feeSol;

        if (recentTransactions.length < 15) {
          const kind: WalletTransaction['type'] = isSwapHeuristic ? 'SWAP' : 'TRANSFER';
          recentTransactions.push({
            signature: sigInfo.signature,
            timestamp: (sigInfo.blockTime || Math.floor(Date.now() / 1000)) * 1000,
            type: kind,
            solDelta,
            usdDelta: solDelta * solPriceUsd,
            feeSol,
            status: sigInfo.err ? 'failed' : 'success',
            summary: detail
              ? `${kind === 'SWAP' ? 'Token swap' : 'Transfer'} (${solDelta >= 0 ? '+' : ''}${solDelta.toFixed(4)} SOL)`
              : `Confirmed tx (${sigInfo.signature.slice(0, 6)}…)`,
          });
        }
      }

      const topTokens: TokenSummary[] = Array.from(tokenMap.entries())
        .map(([mint, info]) => ({
          mint,
          symbol: shortenMint(mint),
          netChange: info.netChange,
          txCount: info.txCount,
        }))
        .sort((a, b) => b.txCount - a.txCount)
        .slice(0, 6);

      return {
        walletAddress: address,
        solBalance,
        solPriceUsd,
        totalNetPnlUsd: totalNetPnlSol * solPriceUsd,
        totalNetPnlSol,
        tradesCount,
        winRate: tradesCount > 0 ? Math.round((winningTrades / tradesCount) * 1000) / 10 : 0,
        totalGasFeesUsd: totalGasFeesSol * solPriceUsd,
        totalGasFeesSol,
        isEmpty: false,
        dataSource: endpoint.includes('helius-rpc.com') ? 'helius-rpc' : 'solana-rpc',
        topTokens,
        recentTransactions,
        analyzedAt: new Date().toISOString(),
      };
    } catch {
      continue;
    }
  }

  throw new Error('Unable to reach Solana RPC nodes right now. Please try again in a moment.');
}

export function formatWalletContextForPrompt(analysis?: Partial<WalletAnalysis> | null): string {
  if (!analysis || !analysis.walletAddress) {
    return [
      'No wallet scanned yet (0 trades baseline).',
      'SOL Balance: 0.0000 SOL',
      'Total Net PnL: $0.00',
      'Trades Count: 0',
      'Win Rate: 0%',
      'Total Gas Fees: $0.00',
    ].join('\n');
  }

  const tokensLine =
    analysis.topTokens && analysis.topTokens.length > 0
      ? analysis.topTokens
          .map((t) => `${t.symbol} (net ${t.netChange >= 0 ? '+' : ''}${t.netChange.toFixed(2)}, ${t.txCount} txs)`)
          .join(', ')
      : 'None observed';

  return [
    `Wallet Address: ${analysis.walletAddress}`,
    `SOL Balance: ${(analysis.solBalance ?? 0).toFixed(4)} SOL (~$${((analysis.solBalance ?? 0) * (analysis.solPriceUsd ?? 185)).toFixed(2)})`,
    `Total Net PnL: $${(analysis.totalNetPnlUsd ?? 0).toFixed(2)} (${(analysis.totalNetPnlSol ?? 0).toFixed(4)} SOL)`,
    `Trades Count (swaps & transfers): ${analysis.tradesCount ?? 0}`,
    `Win Rate: ${(analysis.winRate ?? 0).toFixed(1)}%`,
    `Total Gas Fees: $${(analysis.totalGasFeesUsd ?? 0).toFixed(4)} (${(analysis.totalGasFeesSol ?? 0).toFixed(6)} SOL)`,
    `Top Tokens: ${tokensLine}`,
  ].join('\n');
}

export async function verifySolanaPaymentOnRpc(signature: string) {
  for (const endpoint of getRpcEndpoints()) {
    try {
      const tx = await rpcCall<{
        meta?: {
          err?: unknown;
          preBalances?: number[];
          postBalances?: number[];
          preTokenBalances?: Array<{ owner?: string; mint?: string; uiTokenAmount?: { uiAmount?: number | null } }>;
          postTokenBalances?: Array<{ owner?: string; mint?: string; uiTokenAmount?: { uiAmount?: number | null } }>;
        };
        transaction?: {
          message?: { accountKeys?: Array<string | { pubkey?: string }> };
        };
      } | null>(endpoint, 'getTransaction', [
        signature,
        { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
      ]);

      if (!tx) continue;
      if (tx.meta?.err !== null && tx.meta?.err !== undefined) {
        return { found: true, succeeded: false, solReceived: 0, stablecoinReceivedUsd: 0 };
      }

      const accountKeys = (tx.transaction?.message?.accountKeys || []).map((k) =>
        typeof k === 'string' ? k : k?.pubkey || ''
      );
      const merchantIdx = accountKeys.indexOf(MERCHANT_SOLANA_WALLET);
      let solReceived = 0;
      if (
        merchantIdx >= 0 &&
        tx.meta?.preBalances &&
        tx.meta?.postBalances &&
        typeof tx.meta.preBalances[merchantIdx] === 'number' &&
        typeof tx.meta.postBalances[merchantIdx] === 'number'
      ) {
        solReceived = Math.max(
          0,
          (tx.meta.postBalances[merchantIdx] - tx.meta.preBalances[merchantIdx]) / 1e9
        );
      }

      const STABLE_MINTS = new Set([
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      ]);
      let preStable = 0;
      let postStable = 0;
      for (const bal of tx.meta?.preTokenBalances || []) {
        if (bal.owner === MERCHANT_SOLANA_WALLET && bal.mint && STABLE_MINTS.has(bal.mint)) {
          preStable += Number(bal.uiTokenAmount?.uiAmount || 0);
        }
      }
      for (const bal of tx.meta?.postTokenBalances || []) {
        if (bal.owner === MERCHANT_SOLANA_WALLET && bal.mint && STABLE_MINTS.has(bal.mint)) {
          postStable += Number(bal.uiTokenAmount?.uiAmount || 0);
        }
      }
      return {
        found: true,
        succeeded: true,
        solReceived,
        stablecoinReceivedUsd: Math.max(0, postStable - preStable),
      };
    } catch {
      continue;
    }
  }
  return { found: false, succeeded: false, solReceived: 0, stablecoinReceivedUsd: 0 };
}
