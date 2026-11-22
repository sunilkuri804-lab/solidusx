import type {
  CoachMessage,
  RoastResult,
  SolPriceHistory,
  SubscriptionTier,
  UserProfile,
  WalletAnalysis,
  WhaleDecodeResult,
  WhatIfResult,
} from '../types';

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

export async function signUpEmail(email: string, password: string) {
  return requestJson<{ token: string; profile: UserProfile }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function loginEmail(email: string, password: string) {
  return requestJson<{ token: string; profile: UserProfile }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function fetchProfile(token: string) {
  return requestJson<{ profile: UserProfile }>('/api/auth/me', { method: 'GET' }, token);
}

export async function upgradeTier(token: string, tier: SubscriptionTier) {
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
  return requestJson<{ profile: UserProfile }>(
    '/api/auth/reward-ad',
    { method: 'POST' },
    token
  );
}

export async function deleteAccount(token: string) {
  return requestJson<{ deleted: boolean }>('/api/auth/account', { method: 'DELETE' }, token);
}

export async function analyzeWallet(token: string, walletAddress: string) {
  return requestJson<{ analysis: WalletAnalysis; profile: UserProfile }>(
    '/api/solana/analyze',
    {
      method: 'POST',
      body: JSON.stringify({ walletAddress: walletAddress.trim() }),
    },
    token
  );
}

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

export async function fetchSolHistory() {
  return requestJson<SolPriceHistory>('/api/solana/sol-history', { method: 'GET' });
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
