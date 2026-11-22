import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import type {
  SolPriceHistory,
  SolPricePoint,
  SubscriptionTier,
  TokenPriceQuote,
  TokenSummary,
  UserProfile,
  WalletAnalysis,
  WalletTransaction,
} from './src/types.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const HELIUS_API_KEY = (process.env.HELIUS_API_KEY || '').trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const MERCHANT_SOLANA_WALLET = '9XEcqn4CfftDGx3DJLdHgPc7KoF9YPUgeQvHaBztCEt2';
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOLANA_SIGNATURE_REGEX = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEN_MINUTES_MS = 10 * 60 * 1000;

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

// Persistent local store for user profiles & credentials
const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_FILE = path.join(DATA_DIR, 'solidusx-store.json');

const MAX_FREE_AD_SCANS_PER_DAY = 2;

interface StoredUser {
  id: string;
  email: string;
  passwordHash?: string;
  passwordSalt?: string;
  tier: SubscriptionTier;
  dailyChecks: number;
  bonusChecks: number;
  adScansToday?: number;
  lastCheckDate: string;
  authProvider: 'email' | 'google' | 'supabase';
  createdAt: string;
}

interface UsedPaymentRecord {
  userId: string;
  tier: SubscriptionTier;
  billing: 'monthly' | 'annual';
  verifiedAt: string;
}

interface StoreState {
  users: Record<string, StoredUser>; // keyed by lowercase email
  usedPaymentSignatures?: Record<string, UsedPaymentRecord>;
}

function ensureStoreDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadStore(): StoreState {
  ensureStoreDir();
  if (!fs.existsSync(STORE_FILE)) {
    return { users: {}, usedPaymentSignatures: {} };
  }
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as StoreState;
    if (parsed && typeof parsed === 'object' && parsed.users) {
      return {
        users: parsed.users,
        usedPaymentSignatures: parsed.usedPaymentSignatures || {},
      };
    }
  } catch {
    // Corrupted store resets cleanly
  }
  return { users: {}, usedPaymentSignatures: {} };
}

function saveStore(state: StoreState): void {
  ensureStoreDir();
  const tmpFile = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpFile, STORE_FILE);
}

let store: StoreState = loadStore();

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDailyLimit(tier: SubscriptionTier): number | null {
  if (tier === 'Free') return 1;
  if (tier === 'Pro') return 50;
  return null;
}

function syncUserDailyReset(user: StoredUser): boolean {
  const today = todayUtc();
  if (user.lastCheckDate !== today) {
    user.lastCheckDate = today;
    user.dailyChecks = 0;
    user.adScansToday = 0;
    if (user.tier === 'Free') {
      user.bonusChecks = 0;
    }
    return true;
  }
  return false;
}

function toPublicProfile(user: StoredUser): UserProfile {
  return {
    id: user.id,
    email: user.email,
    tier: user.tier,
    dailyChecks: user.dailyChecks,
    dailyLimit: getDailyLimit(user.tier),
    bonusChecks: user.bonusChecks,
    adScansToday: user.adScansToday ?? 0,
    maxAdScansPerDay: user.tier === 'Free' ? MAX_FREE_AD_SCANS_PER_DAY : 0,
    lastCheckDate: user.lastCheckDate,
    authProvider: user.authProvider,
    createdAt: user.createdAt,
  };
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { hash: derived, salt: actualSalt };
}

function verifyPassword(password: string, storedHash: string, storedSalt: string): boolean {
  const { hash } = hashPassword(password, storedSalt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

interface SessionPayload {
  userId: string;
  email: string;
  exp: number;
}

function signSessionToken(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as SessionPayload;
    if (!parsed?.userId || !parsed?.email || typeof parsed.exp !== 'number') return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isLiveSupabaseConfigured(): boolean {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const parsed = new URL(SUPABASE_URL);
    return parsed.hostname.endsWith('.supabase.co') && parsed.hostname.split('.').length >= 3;
  } catch {
    return false;
  }
}

async function resolveAuthenticatedUser(req: Request): Promise<StoredUser | null> {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  // 1. Check built-in HMAC session token
  const payload = verifySessionToken(token);
  if (payload) {
    const user = store.users[payload.email.toLowerCase()];
    if (!user || user.id !== payload.userId) return null;
    if (syncUserDailyReset(user)) saveStore(store);
    return user;
  }

  // 2. If live Supabase project is configured, verify Supabase JWT against /auth/v1/user
  if (isLiveSupabaseConfigured()) {
    try {
      const resp = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      });
      if (resp.ok) {
        const sbUser = (await resp.json()) as { id?: string; email?: string };
        if (sbUser?.email) {
          const key = sbUser.email.toLowerCase();
          let existing = store.users[key];
          if (!existing) {
            existing = {
              id: sbUser.id || crypto.randomUUID(),
              email: sbUser.email,
              tier: 'Free',
              dailyChecks: 0,
              bonusChecks: 0,
              adScansToday: 0,
              lastCheckDate: todayUtc(),
              authProvider: 'supabase',
              createdAt: new Date().toISOString(),
            };
            store.users[key] = existing;
            saveStore(store);
          } else if (syncUserDailyReset(existing)) {
            saveStore(store);
          }
          return existing;
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}

interface AuthenticatedRequest extends Request {
  currentUser?: StoredUser;
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const user = await resolveAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
    return;
  }
  req.currentUser = user;
  next();
}

function requirePaidAiTier(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.currentUser || req.currentUser.tier === 'Free') {
    res.status(403).json({
      error: 'PRO_REQUIRED',
      message: 'All 4 AI tools require a Pro or Super subscription. Upgrade to unlock.',
    });
    return;
  }
  next();
}

// 10-minute in-memory cache for Gemini AI & wallet analysis
interface CacheEntry<T> {
  data: T;
  createdAt: number;
  expiresAt: number;
}

const aiCache = new Map<string, CacheEntry<unknown>>();
const walletAnalysisCache = new Map<string, CacheEntry<WalletAnalysis>>();
let cachedSolPrice: { price: number; expiresAt: number } | null = null;

function getCachedAi<T>(key: string): { data: T; expiresAt: number } | null {
  const entry = aiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    aiCache.delete(key);
    return null;
  }
  return { data: entry.data as T, expiresAt: entry.expiresAt };
}

function setCachedAi<T>(key: string, data: T): number {
  const now = Date.now();
  const expiresAt = now + TEN_MINUTES_MS;
  aiCache.set(key, { data, createdAt: now, expiresAt });
  return expiresAt;
}

async function fetchSolPriceUsd(): Promise<number> {
  if (cachedSolPrice && Date.now() < cachedSolPrice.expiresAt) {
    return cachedSolPrice.price;
  }
  try {
    const resp = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { signal: AbortSignal.timeout(5000) }
    );
    if (resp.ok) {
      const data = (await resp.json()) as { solana?: { usd?: number } };
      const price = data?.solana?.usd;
      if (typeof price === 'number' && price > 0) {
        cachedSolPrice = { price, expiresAt: Date.now() + 5 * 60 * 1000 };
        return price;
      }
    }
  } catch {
    // Fallback below
  }
  return cachedSolPrice?.price || 185;
}

let cachedSolHistory: { data: SolPriceHistory; expiresAt: number } | null = null;

function formatShortDateLabel(tsMs: number): string {
  return new Date(tsMs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

async function fetchSol7DayHistory(): Promise<SolPriceHistory> {
  if (cachedSolHistory && Date.now() < cachedSolHistory.expiresAt) {
    return { ...cachedSolHistory.data, source: 'cached' };
  }

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

        const firstPrice = sampled[0].price;
        const currentPrice = sampled[sampled.length - 1].price;
        const change7dPct =
          firstPrice > 0 ? Math.round(((currentPrice - firstPrice) / firstPrice) * 1000) / 10 : 0;

        const data: SolPriceHistory = {
          currentPriceUsd: currentPrice,
          change7dPct,
          points: sampled,
          source: 'coingecko',
        };
        cachedSolHistory = { data, expiresAt: Date.now() + 15 * 60 * 1000 };
        return data;
      }
    }
  } catch {
    // Try Kraken fallback
  }

  // Secondary: Kraken public 4h OHLC (last 42 candles = 7 days)
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
          const closePrice = Math.round(Number(c[4]) * 100) / 100;
          return {
            timestamp: tsMs,
            label: formatShortDateLabel(tsMs),
            price: closePrice,
          };
        });
        const firstPrice = sampled[0].price;
        const currentPrice = sampled[sampled.length - 1].price;
        const change7dPct =
          firstPrice > 0 ? Math.round(((currentPrice - firstPrice) / firstPrice) * 1000) / 10 : 0;

        const data: SolPriceHistory = {
          currentPriceUsd: currentPrice,
          change7dPct,
          points: sampled,
          source: 'kraken',
        };
        cachedSolHistory = { data, expiresAt: Date.now() + 15 * 60 * 1000 };
        return data;
      }
    }
  } catch {
    // Fallback below
  }

  const fallbackPrice = await fetchSolPriceUsd();
  if (cachedSolHistory) {
    return { ...cachedSolHistory.data, source: 'cached' };
  }
  const now = Date.now();
  // Smooth 14-point fallback curve anchored to live/fallback SOL spot price so sparkline renders cleanly
  const relativeCurve = [-0.032, -0.025, -0.029, -0.018, -0.021, -0.011, -0.014, -0.004, 0.002, -0.006, 0.004, 0.009, 0.003, 0];
  const fallbackPoints: SolPricePoint[] = relativeCurve.map((offset, idx) => {
    const ts = now - (relativeCurve.length - 1 - idx) * 12 * 60 * 60 * 1000;
    const price = Math.round(fallbackPrice * (1 + offset) * 100) / 100;
    return {
      timestamp: ts,
      label: formatShortDateLabel(ts),
      price,
    };
  });
  const firstFallback = fallbackPoints[0].price;
  const lastFallback = fallbackPoints[fallbackPoints.length - 1].price;
  const fallbackChangePct =
    firstFallback > 0 ? Math.round(((lastFallback - firstFallback) / firstFallback) * 1000) / 10 : 0;

  return {
    currentPriceUsd: lastFallback,
    change7dPct: fallbackChangePct,
    points: fallbackPoints,
    source: 'cached',
  };
}

async function rpcCall<T>(endpoint: string, method: string, params: unknown[]): Promise<T> {
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    throw new Error(`RPC HTTP ${resp.status}`);
  }
  const json = (await resp.json()) as { result?: T; error?: { message?: string } };
  if (json.error) {
    throw new Error(json.error.message || 'RPC error');
  }
  return json.result as T;
}

async function rpcBatchGetTransactions(
  endpoint: string,
  signatures: string[]
): Promise<Array<Record<string, unknown> | null>> {
  if (signatures.length === 0) return [];
  const batchPayload = signatures.map((sig, idx) => ({
    jsonrpc: '2.0',
    id: idx + 1,
    method: 'getTransaction',
    params: [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
  }));
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batchPayload),
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) {
    throw new Error(`RPC batch HTTP ${resp.status}`);
  }
  const json = (await resp.json()) as Array<{ id: number; result?: Record<string, unknown> | null }>;
  if (!Array.isArray(json)) return [];
  json.sort((a, b) => a.id - b.id);
  return json.map((item) => item.result ?? null);
}

function getRpcEndpoints(): string[] {
  const list: string[] = [];
  if (HELIUS_API_KEY) {
    list.push(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(HELIUS_API_KEY)}`);
  }
  list.push('https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com');
  return list;
}

async function fetchSolBalance(address: string): Promise<{ sol: number; rpcUsed: string }> {
  const endpoints = getRpcEndpoints();
  for (const endpoint of endpoints) {
    try {
      const result = await rpcCall<{ value?: number }>(endpoint, 'getBalance', [address]);
      const lamports = typeof result?.value === 'number' ? result.value : 0;
      return { sol: lamports / 1e9, rpcUsed: endpoint };
    } catch {
      continue;
    }
  }
  return { sol: 0, rpcUsed: endpoints[endpoints.length - 1] };
}

function getPlanUsdPrice(tier: 'Pro' | 'Super', billing: 'monthly' | 'annual'): number {
  if (tier === 'Pro') return 19;
  return billing === 'annual' ? 1099 : 89;
}

async function syncTierToSupabase(userId: string, tier: SubscriptionTier): Promise<boolean> {
  if (!isLiveSupabaseConfigured() || !SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }
  try {
    const resp = await fetch(
      `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          tier,
          updated_at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(6000),
      }
    );
    return resp.ok;
  } catch {
    return false;
  }
}

interface VerifiedSolanaTxResult {
  found: boolean;
  succeeded: boolean;
  solReceived: number;
  stablecoinReceivedUsd: number;
  rpcUsed: string;
}

async function verifySolanaPaymentOnRpc(signature: string): Promise<VerifiedSolanaTxResult> {
  const endpoints = getRpcEndpoints();
  let lastRpc = endpoints[0];

  for (const endpoint of endpoints) {
    lastRpc = endpoint;
    try {
      const tx = await rpcCall<{
        meta?: {
          err?: unknown;
          preBalances?: number[];
          postBalances?: number[];
          preTokenBalances?: Array<{
            owner?: string;
            mint?: string;
            uiTokenAmount?: { uiAmount?: number | null };
          }>;
          postTokenBalances?: Array<{
            owner?: string;
            mint?: string;
            uiTokenAmount?: { uiAmount?: number | null };
          }>;
        };
        transaction?: {
          message?: {
            accountKeys?: Array<string | { pubkey?: string }>;
          };
        };
      } | null>(endpoint, 'getTransaction', [
        signature,
        { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
      ]);

      if (!tx) {
        continue;
      }

      if (tx.meta?.err !== null && tx.meta?.err !== undefined) {
        return {
          found: true,
          succeeded: false,
          solReceived: 0,
          stablecoinReceivedUsd: 0,
          rpcUsed: endpoint,
        };
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
        const deltaLamports = tx.meta.postBalances[merchantIdx] - tx.meta.preBalances[merchantIdx];
        solReceived = Math.max(0, deltaLamports / 1e9);
      }

      const STABLE_MINTS = new Set([
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
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
      const stablecoinReceivedUsd = Math.max(0, postStable - preStable);

      return {
        found: true,
        succeeded: true,
        solReceived,
        stablecoinReceivedUsd,
        rpcUsed: endpoint,
      };
    } catch {
      continue;
    }
  }

  return {
    found: false,
    succeeded: false,
    solReceived: 0,
    stablecoinReceivedUsd: 0,
    rpcUsed: lastRpc,
  };
}

interface HeliusTx {
  signature?: string;
  timestamp?: number;
  type?: string;
  fee?: number;
  feePayer?: string;
  description?: string;
  transactionError?: unknown;
  nativeTransfers?: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    amount?: number;
  }>;
  tokenTransfers?: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    tokenAmount?: number;
    mint?: string;
  }>;
  events?: {
    swap?: unknown;
  };
}

function shortenMint(mint: string): string {
  return KNOWN_TOKENS[mint] || `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

async function analyzeSolanaWalletOnChain(address: string): Promise<WalletAnalysis> {
  const solPriceUsd = await fetchSolPriceUsd();
  const { sol: solBalance } = await fetchSolBalance(address);

  // 1. Try Helius Enhanced Transactions API when HELIUS_API_KEY is available
  if (HELIUS_API_KEY) {
    try {
      const heliusUrl = `https://api.helius.xyz/v0/addresses/${encodeURIComponent(address)}/transactions?api-key=${encodeURIComponent(HELIUS_API_KEY)}&limit=50`;
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
              tx.type === 'TRANSFER' ||
              Boolean(tx.events?.swap) ||
              Math.abs(solDelta) > 0.00001 ||
              touchedTokens;

            if (isSwapOrTransfer) {
              tradesCount += 1;
              totalNetPnlSol += solDelta;
              if (solDelta > 0 || (solDelta >= 0 && touchedTokens)) {
                winningTrades += 1;
              }
            }

            if (recentTransactions.length < 15) {
              const txType: WalletTransaction['type'] =
                tx.type === 'SWAP' || tx.events?.swap
                  ? 'SWAP'
                  : tx.type === 'TRANSFER' || Math.abs(solDelta) > 0 || touchedTokens
                    ? 'TRANSFER'
                    : 'CONTRACT';
              recentTransactions.push({
                signature: tx.signature || 'unknown',
                timestamp: (tx.timestamp || Math.floor(Date.now() / 1000)) * 1000,
                type: txType,
                solDelta,
                usdDelta: solDelta * solPriceUsd,
                feeSol,
                status: tx.transactionError ? 'failed' : 'success',
                summary:
                  tx.description ||
                  `${txType === 'SWAP' ? 'Token swap' : 'On-chain transfer'} (${solDelta >= 0 ? '+' : ''}${solDelta.toFixed(4)} SOL)`,
              });
            }
          }

          const topTokens: TokenSummary[] = Array.from(tokenMap.entries())
            .sort((a, b) => b[1].txCount - a[1].txCount)
            .slice(0, 6)
            .map(([mint, info]) => ({
              mint,
              symbol: shortenMint(mint),
              netChange: info.netChange,
              txCount: info.txCount,
            }));

          const winRate = tradesCount > 0 ? Math.round((winningTrades / tradesCount) * 1000) / 10 : 0;

          return {
            walletAddress: address,
            solBalance,
            solPriceUsd,
            totalNetPnlUsd: totalNetPnlSol * solPriceUsd,
            totalNetPnlSol,
            tradesCount,
            winRate,
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
      // Fallback to RPC below
    }
  }

  // 2. Fallback: Helius RPC / Standard Solana RPC getSignaturesForAddress + batched getTransaction
  const endpoints = getRpcEndpoints();
  let sigInfos: Array<{ signature: string; blockTime?: number | null; err?: unknown }> = [];
  let sourceUsed: WalletAnalysis['dataSource'] = HELIUS_API_KEY ? 'helius-rpc' : 'solana-rpc';
  let activeEndpoint = endpoints[0];

  for (const endpoint of endpoints) {
    try {
      const result = await rpcCall<Array<{ signature: string; blockTime?: number | null; err?: unknown }>>(
        endpoint,
        'getSignaturesForAddress',
        [address, { limit: 50 }]
      );
      if (Array.isArray(result)) {
        sigInfos = result;
        activeEndpoint = endpoint;
        sourceUsed = endpoint.includes('helius-rpc') ? 'helius-rpc' : 'solana-rpc';
        break;
      }
    } catch {
      continue;
    }
  }

  if (sigInfos.length === 0) {
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
      dataSource: sourceUsed,
      topTokens: [],
      recentTransactions: [],
      analyzedAt: new Date().toISOString(),
    };
  }

  // Fetch parsed transactions in chunks of 10 (up to 30 most recent to avoid public RPC rate limits)
  const targetSigs = sigInfos.slice(0, 30).map((s) => s.signature);
  const parsedTxs: Array<Record<string, unknown> | null> = [];

  for (let i = 0; i < targetSigs.length; i += 10) {
    const chunk = targetSigs.slice(i, i + 10);
    let loadedChunk: Array<Record<string, unknown> | null> | null = null;
    for (const ep of [activeEndpoint, ...endpoints.filter((e) => e !== activeEndpoint)]) {
      try {
        loadedChunk = await rpcBatchGetTransactions(ep, chunk);
        if (loadedChunk.some((item) => item !== null)) {
          break;
        }
      } catch {
        continue;
      }
    }
    if (loadedChunk) {
      parsedTxs.push(...loadedChunk);
    }
  }

  let totalNetPnlSol = 0;
  let totalGasFeesSol = 0;
  let tradesCount = 0;
  let winningTrades = 0;
  const tokenMap = new Map<string, { netChange: number; txCount: number }>();
  const recentTransactions: WalletTransaction[] = [];

  for (let i = 0; i < sigInfos.length; i += 1) {
    const sigInfo = sigInfos[i];
    const tx = parsedTxs[i];

    if (!tx) {
      // Even if a single tx detail wasn't returned by public RPC, count valid tx activity accurately
      if (i >= targetSigs.length) {
        tradesCount += 1;
      }
      continue;
    }

    const meta = tx.meta as {
      fee?: number;
      err?: unknown;
      preBalances?: number[];
      postBalances?: number[];
      preTokenBalances?: Array<{ owner?: string; mint?: string; uiTokenAmount?: { uiAmount?: number | null } }>;
      postTokenBalances?: Array<{ owner?: string; mint?: string; uiTokenAmount?: { uiAmount?: number | null } }>;
    } | null;

    const message = (tx.transaction as { message?: { accountKeys?: Array<string | { pubkey?: string }> } })?.message;
    const accountKeys = (message?.accountKeys || []).map((k) =>
      typeof k === 'string' ? k : k?.pubkey || ''
    );
    const idx = accountKeys.indexOf(address);

    const feeLamports = meta?.fee || 0;
    const isFeePayer = idx === 0;
    const feeSol = isFeePayer ? feeLamports / 1e9 : 0;
    totalGasFeesSol += feeSol;

    let solDelta = 0;
    if (idx >= 0 && meta?.preBalances && meta?.postBalances) {
      const pre = meta.preBalances[idx] || 0;
      const post = meta.postBalances[idx] || 0;
      const rawDelta = (post - pre) / 1e9;
      solDelta = isFeePayer ? rawDelta + feeSol : rawDelta;
    }

    // Compare SPL token balances owned by address
    const preTokens = new Map<string, number>();
    const postTokens = new Map<string, number>();
    for (const tb of meta?.preTokenBalances || []) {
      if (tb.owner === address && tb.mint) {
        preTokens.set(tb.mint, (preTokens.get(tb.mint) || 0) + (tb.uiTokenAmount?.uiAmount || 0));
      }
    }
    for (const tb of meta?.postTokenBalances || []) {
      if (tb.owner === address && tb.mint) {
        postTokens.set(tb.mint, (postTokens.get(tb.mint) || 0) + (tb.uiTokenAmount?.uiAmount || 0));
      }
    }

    const allMints = new Set([...preTokens.keys(), ...postTokens.keys()]);
    let tokenChangedCount = 0;
    let firstTokenLabel = '';
    for (const mint of allMints) {
      const delta = (postTokens.get(mint) || 0) - (preTokens.get(mint) || 0);
      if (Math.abs(delta) > 1e-9) {
        tokenChangedCount += 1;
        if (!firstTokenLabel) firstTokenLabel = shortenMint(mint);
        const existing = tokenMap.get(mint) || { netChange: 0, txCount: 0 };
        existing.netChange += delta;
        existing.txCount += 1;
        tokenMap.set(mint, existing);
      }
    }

    const isSwap = tokenChangedCount >= 2 || (tokenChangedCount >= 1 && Math.abs(solDelta) > 0.0001);
    const isTransfer = tokenChangedCount === 1 || Math.abs(solDelta) > 0.00001;

    if (isSwap || isTransfer || !meta?.err) {
      tradesCount += 1;
      totalNetPnlSol += solDelta;
      if (solDelta > 0 || (solDelta >= -0.001 && tokenChangedCount > 0)) {
        winningTrades += 1;
      }
    }

    if (recentTransactions.length < 15) {
      const txType: WalletTransaction['type'] = isSwap ? 'SWAP' : isTransfer ? 'TRANSFER' : 'CONTRACT';
      const summary = isSwap
        ? `Swap involving ${firstTokenLabel || 'SPL'} (${solDelta >= 0 ? '+' : ''}${solDelta.toFixed(4)} SOL)`
        : isTransfer
          ? `${firstTokenLabel ? `${firstTokenLabel} transfer` : 'SOL transfer'} (${solDelta >= 0 ? '+' : ''}${solDelta.toFixed(4)} SOL)`
          : 'Program interaction';

      recentTransactions.push({
        signature: sigInfo.signature,
        timestamp: ((sigInfo.blockTime || Math.floor(Date.now() / 1000)) as number) * 1000,
        type: txType,
        solDelta,
        usdDelta: solDelta * solPriceUsd,
        feeSol,
        status: meta?.err || sigInfo.err ? 'failed' : 'success',
        summary,
      });
    }
  }

  const topTokens: TokenSummary[] = Array.from(tokenMap.entries())
    .sort((a, b) => b[1].txCount - a[1].txCount)
    .slice(0, 6)
    .map(([mint, info]) => ({
      mint,
      symbol: shortenMint(mint),
      netChange: info.netChange,
      txCount: info.txCount,
    }));

  const winRate = tradesCount > 0 ? Math.round((winningTrades / tradesCount) * 1000) / 10 : 0;

  return {
    walletAddress: address,
    solBalance,
    solPriceUsd,
    totalNetPnlUsd: totalNetPnlSol * solPriceUsd,
    totalNetPnlSol,
    tradesCount,
    winRate,
    totalGasFeesUsd: totalGasFeesSol * solPriceUsd,
    totalGasFeesSol,
    isEmpty: false,
    dataSource: sourceUsed,
    topTokens,
    recentTransactions,
    analyzedAt: new Date().toISOString(),
  };
}

function getGeminiClient(): GoogleGenAI {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey: GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatWalletContextForPrompt(analysis?: Partial<WalletAnalysis> | null): string {
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

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Public runtime configuration check (never returns any secrets)
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      supabaseLiveConfigured: isLiveSupabaseConfigured(),
      heliusConfigured: Boolean(HELIUS_API_KEY),
    });
  });

  app.get('/api/solana/sol-history', async (_req, res) => {
    const history = await fetchSol7DayHistory();
    res.json(history);
  });

  app.get('/api/solana/token-prices', async (req, res) => {
    const mintsParam = typeof req.query?.mints === 'string' ? req.query.mints : '';
    const uniqueMints = Array.from(
      new Set(
        mintsParam
          .split(',')
          .map((m) => m.trim())
          .filter((m) => BASE58_REGEX.test(m))
      )
    ).slice(0, 25);

    if (uniqueMints.length === 0) {
      res.status(400).json({ error: 'Provide at least one valid Solana token mint.' });
      return;
    }

    const prices: Record<string, TokenPriceQuote> = {};
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
            if (liq > (bestLiquidity.get(addr) ?? -1)) {
              bestLiquidity.set(addr, liq);
              prices[addr] = {
                mint: addr,
                symbol: pair.baseToken?.symbol || KNOWN_TOKENS[addr] || shortenMint(addr),
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

    if (uniqueMints.includes(SOL_MINT) && !prices[SOL_MINT]) {
      prices[SOL_MINT] = {
        mint: SOL_MINT,
        symbol: 'SOL',
        priceUsd: await fetchSolPriceUsd(),
        change24hPct: null,
      };
    }
    if (uniqueMints.includes(USDC_MINT) && !prices[USDC_MINT]) {
      prices[USDC_MINT] = { mint: USDC_MINT, symbol: 'USDC', priceUsd: 1, change24hPct: 0 };
    }
    if (uniqueMints.includes(USDT_MINT) && !prices[USDT_MINT]) {
      prices[USDT_MINT] = { mint: USDT_MINT, symbol: 'USDT', priceUsd: 1, change24hPct: 0 };
    }

    res.json({ prices });
  });

  // --- AUTH ROUTES ---
  app.post('/api/auth/signup', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    if (store.users[email]) {
      res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
      return;
    }

    const { hash, salt } = hashPassword(password);
    const user: StoredUser = {
      id: crypto.randomUUID(),
      email,
      passwordHash: hash,
      passwordSalt: salt,
      tier: 'Free',
      dailyChecks: 0,
      bonusChecks: 0,
      adScansToday: 0,
      lastCheckDate: todayUtc(),
      authProvider: 'email',
      createdAt: new Date().toISOString(),
    };
    store.users[email] = user;
    saveStore(store);

    const token = signSessionToken({
      userId: user.id,
      email: user.email,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    res.status(201).json({ token, profile: toPublicProfile(user) });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!EMAIL_REGEX.test(email) || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const user = store.users[email];
    if (!user || !user.passwordHash || !user.passwordSalt) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (!verifyPassword(password, user.passwordHash, user.passwordSalt)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (syncUserDailyReset(user)) saveStore(store);

    const token = signSessionToken({
      userId: user.id,
      email: user.email,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ token, profile: toPublicProfile(user) });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ profile: toPublicProfile(req.currentUser!) });
  });

  app.post('/api/auth/upgrade', requireAuth, (req: AuthenticatedRequest, res) => {
    const tier = req.body?.tier as SubscriptionTier;
    if (tier !== 'Free' && tier !== 'Pro' && tier !== 'Super') {
      res.status(400).json({ error: 'Invalid subscription tier.' });
      return;
    }
    if (tier !== 'Free') {
      res.status(402).json({
        error: 'PAYMENT_REQUIRED',
        message: 'Upgrading to Pro or Super requires a verified Solana transaction signature.',
      });
      return;
    }
    const user = req.currentUser!;
    user.tier = 'Free';
    saveStore(store);
    res.json({ profile: toPublicProfile(user) });
  });

  // --- DIRECT SOLANA CRYPTO PAYMENT QUOTE & HELIUS RPC VERIFICATION ---
  app.get('/api/payments/quote', requireAuth, async (_req, res) => {
    const solPriceUsd = await fetchSolPriceUsd();
    const toSol = (usd: number) => Math.ceil((usd / solPriceUsd) * 10000) / 10000;
    res.json({
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
  });

  app.post('/api/payments/verify-solana', requireAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.currentUser!;
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

    if (!store.usedPaymentSignatures) {
      store.usedPaymentSignatures = {};
    }
    if (store.usedPaymentSignatures[rawSig]) {
      res.status(409).json({
        error: 'This Solana transaction signature has already been used to activate a plan.',
      });
      return;
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

      store.usedPaymentSignatures[rawSig] = {
        userId: user.id,
        tier,
        billing,
        verifiedAt: new Date().toISOString(),
      };
      user.tier = tier;
      saveStore(store);

      const supabaseSynced = await syncTierToSupabase(user.id, tier);

      res.json({
        verified: true,
        signature: rawSig,
        solReceived: txResult.solReceived,
        usdValue: Math.round(receivedUsd * 100) / 100,
        supabaseSynced,
        profile: toPublicProfile(user),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to verify Solana transaction on RPC.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/auth/reward-ad', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.currentUser!;
    syncUserDailyReset(user);

    if (user.tier !== 'Free') {
      res.status(400).json({
        error: 'AD_NOT_NEEDED',
        message: 'Pro and Super plans already include expanded ad-free scan limits.',
        profile: toPublicProfile(user),
      });
      return;
    }

    const usedAdScans = user.adScansToday ?? 0;
    if (usedAdScans >= MAX_FREE_AD_SCANS_PER_DAY) {
      res.status(403).json({
        error: 'AD_LIMIT_REACHED',
        message: 'Daily Limit Reached — Upgrade to Pro',
        profile: toPublicProfile(user),
      });
      return;
    }

    user.adScansToday = usedAdScans + 1;
    user.bonusChecks = Math.min(user.bonusChecks + 1, MAX_FREE_AD_SCANS_PER_DAY);
    saveStore(store);
    res.json({ profile: toPublicProfile(user) });
  });

  app.delete('/api/auth/account', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.currentUser!;
    const key = user.email.toLowerCase();
    delete store.users[key];
    saveStore(store);
    res.json({ deleted: true });
  });

  // --- SOLANA WALLET ANALYZER ---
  app.post('/api/solana/analyze', requireAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.currentUser!;
    const rawAddress = typeof req.body?.walletAddress === 'string' ? req.body.walletAddress.trim() : '';

    if (!BASE58_REGEX.test(rawAddress)) {
      res.status(400).json({
        error: 'Invalid Solana wallet address. Please enter a valid 32–44 character Base58 public address.',
      });
      return;
    }

    syncUserDailyReset(user);
    const dailyLimit = getDailyLimit(user.tier);
    const hasDailyRemaining = dailyLimit === null || user.dailyChecks < dailyLimit;
    const hasBonusRemaining = user.bonusChecks > 0;

    if (!hasDailyRemaining && !hasBonusRemaining) {
      const adCapReached =
        user.tier === 'Free' && (user.adScansToday ?? 0) >= MAX_FREE_AD_SCANS_PER_DAY;
      res.status(402).json({
        error: 'DAILY_LIMIT_REACHED',
        message: adCapReached
          ? 'Daily Limit Reached — Upgrade to Pro'
          : 'Daily free scan limit reached. Upgrade to Pro or watch a short ad for +1 free scan.',
        profile: toPublicProfile(user),
      });
      return;
    }

    try {
      // Use short 2-minute cache for identical wallet lookups or fresh on-chain fetch
      const cached = walletAnalysisCache.get(rawAddress);
      let analysis: WalletAnalysis;
      if (cached && Date.now() < cached.expiresAt) {
        analysis = cached.data;
      } else {
        analysis = await analyzeSolanaWalletOnChain(rawAddress);
        walletAnalysisCache.set(rawAddress, {
          data: analysis,
          createdAt: Date.now(),
          expiresAt: Date.now() + 2 * 60 * 1000,
        });
      }

      // Empty Wallet Handling: 0 transactions => do NOT deduct a daily check!
      if (!analysis.isEmpty && analysis.tradesCount > 0) {
        if (dailyLimit === null || user.dailyChecks < dailyLimit) {
          user.dailyChecks += 1;
        } else if (user.bonusChecks > 0) {
          user.bonusChecks -= 1;
        }
        saveStore(store);
      }

      res.json({
        analysis,
        profile: toPublicProfile(user),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to fetch Solana wallet data.';
      res.status(502).json({ error: message });
    }
  });

  // --- 4 GEMINI AI FEATURE ENDPOINTS (Pro/Super only, 10-min per-wallet caching, strictly English) ---
  app.post('/api/ai/roast', requireAuth, requirePaidAiTier, async (req: AuthenticatedRequest, res) => {
    const analysis = (req.body?.walletContext || null) as Partial<WalletAnalysis> | null;
    const walletKey = (analysis?.walletAddress || 'unscanned').trim();
    const cacheKey = `roast:${walletKey}:${analysis?.tradesCount ?? 0}`;

    const cached = getCachedAi<{ roastTitle: string; lines: string[]; verdict: string }>(cacheKey);
    if (cached) {
      res.json({ ...cached.data, cached: true, expiresAt: cached.expiresAt });
      return;
    }

    try {
      const ai = getGeminiClient();
      const prompt = [
        'Write a witty, honest, sharp 4-line trading roast strictly in English for this Solana wallet.',
        'If Trades Count is 0, playfully roast them for sitting on the sidelines or holding an untouched wallet.',
        'Do not use emojis or markdown. Keep each of the 4 lines punchy and grounded in the numbers.',
        '',
        formatWalletContextForPrompt(analysis),
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are SolidusX AI, a sharp Solana portfolio analyst. Respond strictly in English.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              roastTitle: { type: Type.STRING, description: 'Short punchy title for the roast card.' },
              lines: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Exactly 4 concise, witty roast lines in English.',
              },
              verdict: { type: Type.STRING, description: 'One-sentence honest takeaway.' },
            },
            required: ['roastTitle', 'lines', 'verdict'],
          },
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim()) as {
        roastTitle?: string;
        lines?: string[];
        verdict?: string;
      };
      const result = {
        roastTitle: parsed.roastTitle || 'Wallet Reality Check',
        lines: (parsed.lines || []).slice(0, 4),
        verdict: parsed.verdict || 'Keep your risk tight and your entries deliberate.',
      };
      const expiresAt = setCachedAi(cacheKey, result);
      res.json({ ...result, cached: false, expiresAt });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gemini AI request failed.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/ai/what-if', requireAuth, requirePaidAiTier, async (req: AuthenticatedRequest, res) => {
    const analysis = (req.body?.walletContext || null) as Partial<WalletAnalysis> | null;
    const walletKey = (analysis?.walletAddress || 'unscanned').trim();
    const cacheKey = `whatif:${walletKey}:${analysis?.tradesCount ?? 0}`;

    const cached = getCachedAi<{
      summary: string;
      totalMissedUsd: number;
      scenarios: Array<{
        token: string;
        action: string;
        actualOutcome: string;
        simulatedOutcome: string;
        missedGainUsd: number;
      }>;
    }>(cacheKey);
    if (cached) {
      res.json({ ...cached.data, cached: true, expiresAt: cached.expiresAt });
      return;
    }

    try {
      const ai = getGeminiClient();
      const prompt = [
        'Run a What-If Time Machine simulation strictly in English for this Solana wallet.',
        'Estimate realistic missed profits on tokens sold too early (or if 0 trades, simulate what disciplined entries in core Solana assets like SOL, JUP, and BONK would have yielded).',
        'Ground the numbers sensibly in the wallet metrics below.',
        '',
        formatWalletContextForPrompt(analysis),
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are SolidusX AI Time Machine. Provide realistic, clearly framed hypothetical holding simulations strictly in English.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING, description: 'Two-sentence overview of timing discipline.' },
              totalMissedUsd: { type: Type.NUMBER, description: 'Total simulated missed USD upside.' },
              scenarios: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    token: { type: Type.STRING },
                    action: { type: Type.STRING },
                    actualOutcome: { type: Type.STRING },
                    simulatedOutcome: { type: Type.STRING },
                    missedGainUsd: { type: Type.NUMBER },
                  },
                  required: ['token', 'action', 'actualOutcome', 'simulatedOutcome', 'missedGainUsd'],
                },
              },
            },
            required: ['summary', 'totalMissedUsd', 'scenarios'],
          },
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim()) as {
        summary?: string;
        totalMissedUsd?: number;
        scenarios?: Array<{
          token: string;
          action: string;
          actualOutcome: string;
          simulatedOutcome: string;
          missedGainUsd: number;
        }>;
      };
      const result = {
        summary: parsed.summary || 'Holding conviction often outperforms rapid rotation on high-beta Solana assets.',
        totalMissedUsd: Number(parsed.totalMissedUsd || 0),
        scenarios: (parsed.scenarios || []).slice(0, 3),
      };
      const expiresAt = setCachedAi(cacheKey, result);
      res.json({ ...result, cached: false, expiresAt });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gemini AI request failed.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/ai/whale-decode', requireAuth, requirePaidAiTier, async (req: AuthenticatedRequest, res) => {
    const targetAddress =
      typeof req.body?.targetWalletAddress === 'string' ? req.body.targetWalletAddress.trim() : '';

    if (!BASE58_REGEX.test(targetAddress)) {
      res.status(400).json({ error: 'Enter a valid Solana wallet address to decode.' });
      return;
    }

    const cacheKey = `whale:${targetAddress}`;
    const cached = getCachedAi<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.json({ ...cached.data, cached: true, expiresAt: cached.expiresAt });
      return;
    }

    try {
      // Fetch real on-chain metrics for the target wallet without burning scan credits
      const existingCached = walletAnalysisCache.get(targetAddress);
      const whaleAnalysis =
        existingCached && Date.now() < existingCached.expiresAt
          ? existingCached.data
          : await analyzeSolanaWalletOnChain(targetAddress);

      walletAnalysisCache.set(targetAddress, {
        data: whaleAnalysis,
        createdAt: Date.now(),
        expiresAt: Date.now() + 2 * 60 * 1000,
      });

      const ai = getGeminiClient();
      const prompt = [
        'Analyze this Solana wallet as a Copy-Whale Decoder strictly in English.',
        'Explain its entry/exit strategy, risk profile, conviction score (0-100), and one actionable takeaway for copy-traders.',
        '',
        formatWalletContextForPrompt(whaleAnalysis),
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are SolidusX AI Copy-Whale Decoder. Deliver concise, objective strategy analysis strictly in English.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              archetype: { type: Type.STRING, description: 'e.g., High-Conviction Swing Trader or Dormant Vault' },
              convictionScore: { type: Type.NUMBER, description: 'Score from 0 to 100.' },
              entryStyle: { type: Type.STRING },
              exitDiscipline: { type: Type.STRING },
              riskProfile: { type: Type.STRING },
              actionableTakeaway: { type: Type.STRING },
            },
            required: [
              'archetype',
              'convictionScore',
              'entryStyle',
              'exitDiscipline',
              'riskProfile',
              'actionableTakeaway',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim()) as {
        archetype?: string;
        convictionScore?: number;
        entryStyle?: string;
        exitDiscipline?: string;
        riskProfile?: string;
        actionableTakeaway?: string;
      };

      const result = {
        walletAddress: targetAddress,
        archetype: parsed.archetype || 'Solana Market Participant',
        convictionScore: Math.max(0, Math.min(100, Math.round(Number(parsed.convictionScore ?? 50)))),
        entryStyle: parsed.entryStyle || 'Selective accumulation around liquid Solana pairs.',
        exitDiscipline: parsed.exitDiscipline || 'Staged exits into momentum.',
        riskProfile: parsed.riskProfile || 'Moderate on-chain exposure.',
        actionableTakeaway:
          parsed.actionableTakeaway || 'Wait for confirmed on-chain volume before mirroring entries.',
        metrics: {
          tradesCount: whaleAnalysis.tradesCount,
          winRate: whaleAnalysis.winRate,
          totalNetPnlUsd: whaleAnalysis.totalNetPnlUsd,
          solBalance: whaleAnalysis.solBalance,
        },
      };
      const expiresAt = setCachedAi(cacheKey, result);
      res.json({ ...result, cached: false, expiresAt });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to decode wallet.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/ai/coach', requireAuth, requirePaidAiTier, async (req: AuthenticatedRequest, res) => {
    const analysis = (req.body?.walletContext || null) as Partial<WalletAnalysis> | null;
    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const userMessage =
      typeof req.body?.message === 'string' ? req.body.message.trim() : '';

    if (!userMessage) {
      res.status(400).json({ error: 'Please enter a message for your AI Coach.' });
      return;
    }

    const walletKey = (analysis?.walletAddress || 'unscanned').trim();
    const isInitialTurn = rawMessages.length <= 1;
    const cacheKey = `coach:${walletKey}:${userMessage.toLowerCase()}`;

    if (isInitialTurn) {
      const cached = getCachedAi<{ reply: string }>(cacheKey);
      if (cached) {
        res.json({ reply: cached.data.reply, cached: true, expiresAt: cached.expiresAt });
        return;
      }
    }

    try {
      const ai = getGeminiClient();
      const history = rawMessages
        .slice(-10)
        .filter((m: unknown): m is { role: 'user' | 'assistant'; content: string } => {
          return (
            Boolean(m) &&
            typeof (m as { content?: unknown }).content === 'string' &&
            ((m as { role?: unknown }).role === 'user' || (m as { role?: unknown }).role === 'assistant')
          );
        })
        .map((m: { role: 'user' | 'assistant'; content: string }) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

      const chat = ai.chats.create({
        model: 'gemini-4-hydrogen',
        history,
        config: {
          systemInstruction: [
            'You are SolidusX AI Coach, a disciplined, pragmatic Solana portfolio and trading coach.',
            'Always respond strictly in clear English (never Hindi or other languages).',
            'Keep answers concise, actionable, and grounded in the scanned wallet metrics below.',
            'Do not give guaranteed financial advice; frame recommendations around risk management, fee efficiency, and execution.',
            '',
            'Scanned Wallet Context:',
            formatWalletContextForPrompt(analysis),
          ].join('\n'),
        },
      });

      const response = await chat.sendMessage({ message: userMessage });
      const reply = (response.text || 'I could not generate advice right now. Please try again.').trim();

      let expiresAt: number | undefined;
      if (isInitialTurn) {
        expiresAt = setCachedAi(cacheKey, { reply });
      }
      res.json({ reply, cached: false, expiresAt });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI Coach failed to respond.';
      res.status(502).json({ error: message });
    }
  });

  // --- PWA & STATIC SERVING ---
  const publicDir = path.resolve(process.cwd(), 'public');
  app.use(
    express.static(publicDir, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('manifest.json') || filePath.endsWith('.webmanifest')) {
          res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
        } else if (filePath.endsWith('sw.js')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Service-Worker-Allowed', '/');
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );

  if (!IS_PRODUCTION) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SolidusX AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
