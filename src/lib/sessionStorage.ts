import type { SubscriptionTier, UserProfile } from '../types';
import { applyVipSuperOverride } from './vip';

export const USER_SESSION_STORAGE_KEY = 'solidusx_session';
const PREVIOUS_SESSION_KEY = 'solidusx_user_session';
const LEGACY_TOKEN_KEY = 'solidusx_session_token_v1';
const LEGACY_PROFILE_KEY = 'solidusx_session_profile_v1';

export interface PersistedUserSession {
  token: string;
  id: string;
  email: string;
  tier: SubscriptionTier;
  isSuper: boolean;
  profile: UserProfile;
}

export function saveUserSession(token: string, rawProfile: UserProfile): PersistedUserSession {
  const profile = applyVipSuperOverride(rawProfile);
  const session: PersistedUserSession = {
    token,
    id: profile.id,
    email: profile.email,
    tier: profile.tier,
    isSuper: profile.tier === 'Super',
    profile,
  };

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(USER_SESSION_STORAGE_KEY, JSON.stringify(session));
      // Clean older session keys so solidusx_session stays the single source of truth
      window.localStorage.removeItem(PREVIOUS_SESSION_KEY);
      window.localStorage.removeItem(LEGACY_TOKEN_KEY);
      window.localStorage.removeItem(LEGACY_PROFILE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }

  return session;
}

function hydrateSessionPayload(parsed: Partial<PersistedUserSession>): {
  token: string;
  profile: UserProfile;
} | null {
  if (!parsed || typeof parsed.token !== 'string' || parsed.token.length === 0) {
    return null;
  }

  const fallbackTier: SubscriptionTier =
    parsed.isSuper || parsed.tier === 'Super'
      ? 'Super'
      : parsed.tier === 'Pro'
        ? 'Pro'
        : 'Free';

  const baseProfile: UserProfile = parsed.profile
    ? parsed.profile
    : {
        id: parsed.id || 'session-user',
        email: parsed.email || '',
        tier: fallbackTier,
        dailyChecks: 0,
        dailyLimit: fallbackTier === 'Super' ? null : fallbackTier === 'Pro' ? 50 : 1,
        bonusChecks: 0,
        adScansToday: 0,
        maxAdScansPerDay: fallbackTier === 'Free' ? 2 : 0,
        lastCheckDate: new Date().toISOString().slice(0, 10),
        authProvider: 'email',
        createdAt: new Date().toISOString(),
      };

  const normalized = applyVipSuperOverride(baseProfile);
  return { token: parsed.token, profile: normalized };
}

export function loadUserSession(): { token: string; profile: UserProfile } | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;

  try {
    const raw = window.localStorage.getItem(USER_SESSION_STORAGE_KEY);
    if (raw) {
      const hydrated = hydrateSessionPayload(JSON.parse(raw) as Partial<PersistedUserSession>);
      if (hydrated) return hydrated;
    }

    // Seamless one-time migration from previous session key names
    const prevRaw = window.localStorage.getItem(PREVIOUS_SESSION_KEY);
    if (prevRaw) {
      const hydrated = hydrateSessionPayload(JSON.parse(prevRaw) as Partial<PersistedUserSession>);
      if (hydrated) {
        saveUserSession(hydrated.token, hydrated.profile);
        return hydrated;
      }
    }

    const legacyToken = window.localStorage.getItem(LEGACY_TOKEN_KEY);
    const legacyProfileRaw = window.localStorage.getItem(LEGACY_PROFILE_KEY);
    if (legacyToken && legacyProfileRaw) {
      const legacyProfile = JSON.parse(legacyProfileRaw) as UserProfile;
      const saved = saveUserSession(legacyToken, legacyProfile);
      return { token: saved.token, profile: saved.profile };
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
    window.localStorage.removeItem(PREVIOUS_SESSION_KEY);
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    window.localStorage.removeItem(LEGACY_PROFILE_KEY);
  } catch {
    // Ignore
  }
}
