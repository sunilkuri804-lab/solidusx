import type { SubscriptionTier, UserProfile } from '../types';

export const VIP_SUPER_EMAIL = 'sunilkuri804@gmail.com';

export function isVipSuperEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === VIP_SUPER_EMAIL;
}

export function getEffectiveTier(email?: string | null, currentTier?: SubscriptionTier): SubscriptionTier {
  if (isVipSuperEmail(email)) return 'Super';
  return currentTier || 'Free';
}

export function applyVipSuperOverride(profile: UserProfile): UserProfile {
  if (!isVipSuperEmail(profile.email)) {
    return profile;
  }
  return {
    ...profile,
    tier: 'Super',
    dailyLimit: null,
    maxAdScansPerDay: 0,
  };
}
