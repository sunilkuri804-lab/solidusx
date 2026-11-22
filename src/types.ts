export type SubscriptionTier = 'Free' | 'Pro' | 'Super';

export interface UserProfile {
  id: string;
  email: string;
  tier: SubscriptionTier;
  dailyChecks: number;
  dailyLimit: number | null; // null = unlimited (Super)
  bonusChecks: number;
  lastCheckDate: string;
  authProvider: 'email' | 'google' | 'supabase';
  createdAt: string;
}

export interface TokenSummary {
  mint: string;
  symbol: string;
  netChange: number;
  txCount: number;
}

export interface WalletTransaction {
  signature: string;
  timestamp: number;
  type: 'SWAP' | 'TRANSFER' | 'CONTRACT' | 'OTHER';
  solDelta: number;
  usdDelta: number;
  feeSol: number;
  status: 'success' | 'failed';
  summary: string;
}

export interface WalletAnalysis {
  walletAddress: string;
  solBalance: number;
  solPriceUsd: number;
  totalNetPnlUsd: number;
  totalNetPnlSol: number;
  tradesCount: number;
  winRate: number;
  totalGasFeesUsd: number;
  totalGasFeesSol: number;
  isEmpty: boolean;
  dataSource: 'helius-enhanced' | 'helius-rpc' | 'solana-rpc';
  topTokens: TokenSummary[];
  recentTransactions: WalletTransaction[];
  analyzedAt: string;
}

export interface RoastResult {
  roastTitle: string;
  lines: string[];
  verdict: string;
  cached?: boolean;
  expiresAt?: number;
}

export interface WhatIfScenario {
  token: string;
  action: string;
  actualOutcome: string;
  simulatedOutcome: string;
  missedGainUsd: number;
}

export interface WhatIfResult {
  summary: string;
  totalMissedUsd: number;
  scenarios: WhatIfScenario[];
  cached?: boolean;
  expiresAt?: number;
}

export interface WhaleDecodeResult {
  walletAddress: string;
  archetype: string;
  convictionScore: number;
  entryStyle: string;
  exitDiscipline: string;
  riskProfile: string;
  actionableTakeaway: string;
  metrics: {
    tradesCount: number;
    winRate: number;
    totalNetPnlUsd: number;
    solBalance: number;
  };
  cached?: boolean;
  expiresAt?: number;
}

export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface SolPricePoint {
  timestamp: number;
  label: string;
  price: number;
}

export interface SolPriceHistory {
  currentPriceUsd: number;
  change7dPct: number;
  points: SolPricePoint[];
  source: 'coingecko' | 'kraken' | 'cached';
}

