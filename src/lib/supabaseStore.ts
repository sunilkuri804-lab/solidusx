import type { User } from '@supabase/supabase-js';
import type { SubscriptionTier, UserProfile } from '../types';
import { supabase } from './supabase';

const MAX_FREE_AD_SCANS_PER_DAY = 2;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDailyLimit(tier: SubscriptionTier): number | null {
  if (tier === 'Free') return 1;
  if (tier === 'Pro') return 50;
  return null;
}

function normalizeTier(raw: unknown): SubscriptionTier {
  if (raw === 'Pro' || raw === 'Super' || raw === 'Free') return raw;
  return 'Free';
}

interface ProfileRowLike {
  id?: string;
  email?: string;
  tier?: string;
  daily_checks?: number;
  dailyChecks?: number;
  bonus_checks?: number;
  bonusChecks?: number;
  ad_scans_today?: number;
  adScansToday?: number;
  last_check_date?: string;
  lastCheckDate?: string;
  auth_provider?: string;
  created_at?: string;
}

function buildUserProfile(sbUser: User, row?: ProfileRowLike | null): UserProfile {
  const meta = (sbUser.user_metadata || {}) as ProfileRowLike;
  const tier = normalizeTier(row?.tier ?? meta.tier);
  const storedDate =
    row?.last_check_date ?? row?.lastCheckDate ?? meta.last_check_date ?? meta.lastCheckDate ?? todayUtc();
  const isNewDay = storedDate !== todayUtc();

  const rawDailyChecks = Number(row?.daily_checks ?? row?.dailyChecks ?? meta.daily_checks ?? meta.dailyChecks ?? 0);
  const rawBonusChecks = Number(row?.bonus_checks ?? row?.bonusChecks ?? meta.bonus_checks ?? meta.bonusChecks ?? 0);
  const rawAdScans = Number(row?.ad_scans_today ?? row?.adScansToday ?? meta.ad_scans_today ?? meta.adScansToday ?? 0);

  const dailyChecks = isNewDay ? 0 : Math.max(0, rawDailyChecks);
  const adScansToday = isNewDay ? 0 : Math.max(0, rawAdScans);
  const bonusChecks = isNewDay && tier === 'Free' ? 0 : Math.max(0, rawBonusChecks);

  const provider =
    sbUser.app_metadata?.provider === 'google'
      ? 'google'
      : 'supabase';

  return {
    id: sbUser.id,
    email: row?.email || sbUser.email || '',
    tier,
    dailyChecks,
    dailyLimit: getDailyLimit(tier),
    bonusChecks,
    adScansToday,
    maxAdScansPerDay: tier === 'Free' ? MAX_FREE_AD_SCANS_PER_DAY : 0,
    lastCheckDate: todayUtc(),
    authProvider: provider,
    createdAt: row?.created_at || sbUser.created_at || new Date().toISOString(),
  };
}

async function persistProfileToSupabase(sbUser: User, profile: UserProfile): Promise<void> {
  if (!supabase) return;

  // 1. Keep Supabase Auth user_metadata in sync as reliable fallback
  await supabase.auth
    .updateUser({
      data: {
        tier: profile.tier,
        daily_checks: profile.dailyChecks,
        bonus_checks: profile.bonusChecks,
        ad_scans_today: profile.adScansToday,
        last_check_date: profile.lastCheckDate,
      },
    })
    .catch(() => undefined);

  // 2. Sync to public.profiles table (try full schema first, then minimal tier/daily_checks schema)
  const fullPayload = {
    id: sbUser.id,
    email: profile.email,
    tier: profile.tier,
    daily_checks: profile.dailyChecks,
    bonus_checks: profile.bonusChecks,
    ad_scans_today: profile.adScansToday,
    last_check_date: profile.lastCheckDate,
    updated_at: new Date().toISOString(),
  };

  const { error: fullErr } = await supabase
    .from('profiles')
    .upsert(fullPayload, { onConflict: 'id' });

  if (fullErr) {
    // Fallback upsert if optional columns like bonus_checks / ad_scans_today are omitted in user's table
    await supabase
      .from('profiles')
      .upsert(
        {
          id: sbUser.id,
          email: profile.email,
          tier: profile.tier,
          daily_checks: profile.dailyChecks,
          last_check_date: profile.lastCheckDate,
        },
        { onConflict: 'id' }
      )
      .then(() => undefined, () => undefined);
  }
}

export async function getSupabaseUserProfile(): Promise<{ token: string; profile: UserProfile }> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const [{ data: sessionData }, { data: userData, error: userErr }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);

  if (userErr || !userData.user || !sessionData.session?.access_token) {
    throw new Error('Session expired. Please sign in again.');
  }

  const sbUser = userData.user;
  const { data: row } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', sbUser.id)
    .maybeSingle();

  const profile = buildUserProfile(sbUser, row as ProfileRowLike | null);

  // If row didn't exist yet or UTC date rolled over, sync cleanly
  const rowDate = (row as ProfileRowLike | null)?.last_check_date;
  if (!row || rowDate !== profile.lastCheckDate) {
    await persistProfileToSupabase(sbUser, profile);
  }

  return {
    token: sessionData.session.access_token,
    profile,
  };
}

export async function signUpWithSupabase(
  email: string,
  password: string
): Promise<{ token: string; profile: UserProfile }> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        tier: 'Free',
        daily_checks: 0,
        bonus_checks: 0,
        ad_scans_today: 0,
        last_check_date: todayUtc(),
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data.user) {
    throw new Error('Unable to create account. Please try again.');
  }
  if (!data.session) {
    throw new Error(
      'Account created! Please check your email inbox and click the confirmation link before signing in.'
    );
  }

  const profile = buildUserProfile(data.user, null);
  await persistProfileToSupabase(data.user, profile);

  return {
    token: data.session.access_token,
    profile,
  };
}

export async function loginWithSupabase(
  email: string,
  password: string
): Promise<{ token: string; profile: UserProfile }> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data.user || !data.session) {
    throw new Error('Invalid email or password.');
  }

  const { data: row } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();

  const profile = buildUserProfile(data.user, row as ProfileRowLike | null);
  if (!row || (row as ProfileRowLike).last_check_date !== profile.lastCheckDate) {
    await persistProfileToSupabase(data.user, profile);
  }

  return {
    token: data.session.access_token,
    profile,
  };
}

export async function claimSupabaseRewardedAd(): Promise<UserProfile> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    throw new Error('Authentication required. Please sign in to continue.');
  }

  const { data: row } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userData.user.id)
    .maybeSingle();

  const profile = buildUserProfile(userData.user, row as ProfileRowLike | null);

  if (profile.tier !== 'Free') {
    throw new Error('Pro and Super plans already include expanded ad-free scan limits.');
  }

  if (profile.adScansToday >= MAX_FREE_AD_SCANS_PER_DAY) {
    const err = new Error('Daily Limit Reached — Upgrade to Pro') as Error & {
      code?: string;
      profile?: UserProfile;
    };
    err.code = 'AD_LIMIT_REACHED';
    err.profile = profile;
    throw err;
  }

  const updated: UserProfile = {
    ...profile,
    adScansToday: profile.adScansToday + 1,
    bonusChecks: Math.min(profile.bonusChecks + 1, MAX_FREE_AD_SCANS_PER_DAY),
  };

  await persistProfileToSupabase(userData.user, updated);
  return updated;
}

export async function consumeSupabaseScanCredit(): Promise<UserProfile> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    throw new Error('Authentication required.');
  }

  const { data: row } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userData.user.id)
    .maybeSingle();

  const profile = buildUserProfile(userData.user, row as ProfileRowLike | null);

  let updated = profile;
  if (profile.dailyLimit === null || profile.dailyChecks < profile.dailyLimit) {
    updated = { ...profile, dailyChecks: profile.dailyChecks + 1 };
  } else if (profile.bonusChecks > 0) {
    updated = { ...profile, bonusChecks: profile.bonusChecks - 1 };
  }

  await persistProfileToSupabase(userData.user, updated);
  return updated;
}

export async function updateSupabaseTier(tier: SubscriptionTier): Promise<UserProfile> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    throw new Error('Authentication required.');
  }

  const { data: row } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userData.user.id)
    .maybeSingle();

  const current = buildUserProfile(userData.user, row as ProfileRowLike | null);
  const updated: UserProfile = {
    ...current,
    tier,
    dailyLimit: getDailyLimit(tier),
    maxAdScansPerDay: tier === 'Free' ? MAX_FREE_AD_SCANS_PER_DAY : 0,
  };

  await persistProfileToSupabase(userData.user, updated);
  return updated;
}

export async function deleteSupabaseAccount(): Promise<void> {
  if (!supabase) return;

  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user) {
    await supabase.from('profiles').delete().eq('id', userData.user.id).then(() => undefined, () => undefined);
    // Invoke optional RPC delete_user if defined in Supabase SQL
    await supabase.rpc('delete_user').then(() => undefined, () => undefined);
  }
  await supabase.auth.signOut().catch(() => undefined);
}
