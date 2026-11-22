import type { SubscriptionTier, UserProfile } from '../types';
import { applyVipSuperOverride } from './vip';

export const USER_SESSION_STORAGE_KEY = 'solidusx_user_session';
const LEGACY_TOKEN_KEY = 'solidusx_session_token_v1';
const LEGACY_PROFILE_KEY = 'solidusx_session_profile_v1';

export interface PersistedUserSession {
  token: string;
  id: string;
  email: string;
  tier: SubscriptionTier;
  profile: UserProfile;
}

export function saveUserSession(token: string, rawProfile: UserProfile): PersistedUserSession {
  const profile = applyVipSuperOverride(rawProfile);
  const session: PersistedUserSession = {
    token,
    id: profile.id,
    email: profile.email,
    tier: profile.tier,
    profile,
  };

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(USER_SESSION_STORAGE_KEY, JSON.stringify(session));
      // Keep legacy keys clean so there is a single source of truth
      window.localStorage.removeItem(LEGACY_TOKEN_KEY);
      window.localStorage.removeItem(LEGACY_PROFILE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }

  return session;
}

export function loadUserSession(): { token: string; profile: UserProfile } | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;

  try {
    const raw = window.localStorage.getItem(USER_SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedUserSession>;
      if (parsed && typeof parsed.token === 'string' && parsed.token.length > 0) {
        const baseProfile: UserProfile = parsed.profile
          ? parsed.profile
          : {
              id: parsed.id || 'session-user',
              email: parsed.email || '',
              tier: parsed.tier || 'Free',
              dailyChecks: 0,
              dailyLimit: parsed.tier === 'Super' ? null : parsed.tier === 'Pro' ? 50 : 1,
              bonusChecks: 0,
              adScansToday: 0,
              maxAdScansPerDay: parsed.tier === 'Free' || !parsed.tier ? 2 : 0,
              lastCheckDate: new Date().toISOString().slice(0, 10),
              authProvider: 'email',
              createdAt: new Date().toISOString(),
            };
        const normalized = applyVipSuperOverride(baseProfile);
        return { token: parsed.token, profile: normalized };
      }
    }

    // Seamless one-time migration from legacy keys if present
    const legacyToken = window.localStorage.getItem(LEGACY_TOKEN_KEY);
    const legacyProfileRaw = window.localStorage.getItem(LEGACY_PROFILE_KEY);
    if (legacyToken && legacyProfileRaw) {
      const legacyProfile = JSON.parse(legacyProfileRaw) as UserProfile;
      const migrated = saveUserSession(legacyToken, legacyProfile);
      return { token: migrated.token, profile: migrated.profile };
    }
  } catch {
    // Ignore corrupted storage entry
  }

  return null;
}

export function clearUserSession(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(USER_SESSION_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    window.localStorage.removeItem(LEGACY_PROFILE_KEY);
  } catch {
    // Ignore
  }
}
