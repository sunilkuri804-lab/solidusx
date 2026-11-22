import type { SubscriptionTier, UserProfile } from '../types';

const USERS_STORAGE_KEY = 'solidusx_local_users_v1';
const MAX_FREE_AD_SCANS_PER_DAY = 2;

interface LocalUserRecord {
  id: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  tier: SubscriptionTier;
  dailyChecks: number;
  bonusChecks: number;
  adScansToday: number;
  lastCheckDate: string;
  createdAt: string;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDailyLimit(tier: SubscriptionTier): number | null {
  if (tier === 'Free') return 1;
  if (tier === 'Pro') return 50;
  return null;
}

function loadUsers(): Record<string, LocalUserRecord> {
  try {
    const raw = window.localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, LocalUserRecord>) : {};
  } catch {
    return {};
  }
}

function saveUsers(users: Record<string, LocalUserRecord>): void {
  try {
    window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch {
    // Ignore storage quota errors
  }
}

async function hashPasswordClient(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function syncDailyReset(rec: LocalUserRecord): boolean {
  const today = todayUtc();
  if (rec.lastCheckDate !== today) {
    rec.lastCheckDate = today;
    rec.dailyChecks = 0;
    rec.adScansToday = 0;
    if (rec.tier === 'Free') {
      rec.bonusChecks = 0;
    }
    return true;
  }
  return false;
}

function toProfile(rec: LocalUserRecord): UserProfile {
  return {
    id: rec.id,
    email: rec.email,
    tier: rec.tier,
    dailyChecks: rec.dailyChecks,
    dailyLimit: getDailyLimit(rec.tier),
    bonusChecks: rec.bonusChecks,
    adScansToday: rec.adScansToday,
    maxAdScansPerDay: rec.tier === 'Free' ? MAX_FREE_AD_SCANS_PER_DAY : 0,
    lastCheckDate: rec.lastCheckDate,
    authProvider: 'email',
    createdAt: rec.createdAt,
  };
}

function makeLocalToken(email: string): string {
  return `local.${btoa(unescape(encodeURIComponent(email)))}`;
}

function emailFromLocalToken(token: string): string | null {
  if (!token.startsWith('local.')) return null;
  try {
    return decodeURIComponent(escape(atob(token.slice('local.'.length))));
  } catch {
    return null;
  }
}

export async function localSignUp(
  emailRaw: string,
  password: string
): Promise<{ token: string; profile: UserProfile }> {
  const email = emailRaw.trim().toLowerCase();
  if (!email.includes('@')) throw new Error('Please enter a valid email address.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');

  const users = loadUsers();
  if (users[email]) {
    throw new Error('An account with this email already exists. Please sign in.');
  }

  const salt = crypto.randomUUID();
  const hash = await hashPasswordClient(password, salt);
  const record: LocalUserRecord = {
    id: crypto.randomUUID(),
    email,
    passwordSalt: salt,
    passwordHash: hash,
    tier: 'Free',
    dailyChecks: 0,
    bonusChecks: 0,
    adScansToday: 0,
    lastCheckDate: todayUtc(),
    createdAt: new Date().toISOString(),
  };
  users[email] = record;
  saveUsers(users);

  return { token: makeLocalToken(email), profile: toProfile(record) };
}

export async function localLogin(
  emailRaw: string,
  password: string
): Promise<{ token: string; profile: UserProfile }> {
  const email = emailRaw.trim().toLowerCase();
  const users = loadUsers();
  const record = users[email];
  if (!record) {
    throw new Error('Invalid email or password.');
  }
  const hash = await hashPasswordClient(password, record.passwordSalt);
  if (hash !== record.passwordHash) {
    throw new Error('Invalid email or password.');
  }
  if (syncDailyReset(record)) saveUsers(users);
  return { token: makeLocalToken(email), profile: toProfile(record) };
}

export function localGetProfile(token: string): UserProfile | null {
  const email = emailFromLocalToken(token);
  if (!email) return null;
  const users = loadUsers();
  const record = users[email];
  if (!record) return null;
  if (syncDailyReset(record)) saveUsers(users);
  return toProfile(record);
}

export function localConsumeScan(token: string): UserProfile {
  const email = emailFromLocalToken(token);
  if (!email) throw new Error('Session expired. Please sign in again.');
  const users = loadUsers();
  const record = users[email];
  if (!record) throw new Error('Account not found.');
  syncDailyReset(record);

  const limit = getDailyLimit(record.tier);
  if (limit === null || record.dailyChecks < limit) {
    record.dailyChecks += 1;
  } else if (record.bonusChecks > 0) {
    record.bonusChecks -= 1;
  }
  saveUsers(users);
  return toProfile(record);
}

export function localClaimRewardAd(token: string): UserProfile {
  const email = emailFromLocalToken(token);
  if (!email) throw new Error('Authentication required.');
  const users = loadUsers();
  const record = users[email];
  if (!record) throw new Error('Account not found.');
  syncDailyReset(record);

  if (record.tier !== 'Free') {
    throw new Error('Pro and Super plans already include expanded ad-free scan limits.');
  }
  if (record.adScansToday >= MAX_FREE_AD_SCANS_PER_DAY) {
    const err = new Error('Daily Limit Reached — Upgrade to Pro') as Error & {
      code?: string;
      profile?: UserProfile;
    };
    err.code = 'AD_LIMIT_REACHED';
    err.profile = toProfile(record);
    throw err;
  }
  record.adScansToday += 1;
  record.bonusChecks = Math.min(record.bonusChecks + 1, MAX_FREE_AD_SCANS_PER_DAY);
  saveUsers(users);
  return toProfile(record);
}

export function localUpdateTier(token: string, tier: SubscriptionTier): UserProfile {
  const email = emailFromLocalToken(token);
  if (!email) throw new Error('Authentication required.');
  const users = loadUsers();
  const record = users[email];
  if (!record) throw new Error('Account not found.');
  record.tier = tier;
  saveUsers(users);
  return toProfile(record);
}

export function localDeleteAccount(token: string): void {
  const email = emailFromLocalToken(token);
  if (!email) return;
  const users = loadUsers();
  delete users[email];
  saveUsers(users);
}
