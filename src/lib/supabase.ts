import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL = 'https://supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_113ILT2HnekD_lVmPyackg_l_prvsEx';
export const DEFAULT_HELIUS_RPC_URL = 'https://helius-rpc.com';

const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const SUPABASE_URL = envUrl || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = envKey || DEFAULT_SUPABASE_ANON_KEY;
export const HELIUS_RPC_URL =
  (import.meta.env.VITE_HELIUS_RPC_URL || '').trim() || DEFAULT_HELIUS_RPC_URL;

export function isLiveSupabaseUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'supabase.co' || parsed.hostname === 'www.supabase.co') {
      return false;
    }
    return parsed.protocol === 'https:' || parsed.hostname === 'localhost';
  } catch {
    return false;
  }
}

// True only when a project-specific Supabase URL (e.g. https://<project-ref>.supabase.co) is configured
export const isSupabaseConfigured = isLiveSupabaseUrl(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 0;

// Always initialize the Supabase client with configured env vars or default fallbacks
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
