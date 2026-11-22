import React, { useState } from 'react';
import { ArrowRight, Lock, Mail, Zap } from 'lucide-react';
import { loginEmail, signUpEmail } from '../lib/api';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { UserProfile } from '../types';

interface AuthScreenProps {
  onAuthenticated: (token: string, profile: UserProfile) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleNotice, setGoogleNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGoogleNotice(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please enter both your email and password.');
      return;
    }

    setLoading(true);
    try {
      const result =
        mode === 'signup'
          ? await signUpEmail(trimmedEmail, password)
          : await loginEmail(trimmedEmail, password);
      onAuthenticated(result.token, result.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleContinue = async () => {
    setError(null);
    setGoogleNotice(null);

    if (isSupabaseConfigured && supabase) {
      setLoading(true);
      try {
        const { error: oauthErr } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
        if (oauthErr) {
          setError(oauthErr.message);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Google sign-in could not be started.');
      } finally {
        setLoading(false);
      }
      return;
    }

    setGoogleNotice(
      'Google OAuth requires your project-specific Supabase URL (e.g. https://<project-id>.supabase.co) in environment settings. Use Email & Password below to create your account immediately.'
    );
  };

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-[#F3F4F6] flex flex-col justify-center px-4 py-10">
      <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Brand & Value Proposition */}
        <div className="lg:col-span-6 space-y-6">
          <div className="inline-flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#14F195]/15 border border-[#14F195]/30 flex items-center justify-center text-[#14F195]">
              <Zap className="w-5 h-5 fill-[#14F195]" />
            </div>
            <span className="font-display text-2xl font-bold tracking-tight text-white">
              SolidusX AI
            </span>
          </div>

          <h1 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-white leading-[1.15] text-balance">
            Solana portfolio clarity and AI trade intelligence.
          </h1>

          <p className="text-[15px] text-zinc-400 leading-relaxed max-w-md">
            Scan any public Solana wallet without connecting keys. Track real on-chain PnL, win
            rate, and gas fees, then unlock honest AI roasts, missed-gain simulations, whale
            decoding, and personal coaching.
          </p>

          <div className="grid grid-cols-3 gap-4 pt-2 border-t border-white/[0.07] max-w-md">
            <div>
              <div className="font-mono tabular-nums text-lg font-semibold text-[#14F195]">
                0 Keys
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">Read-only wallet scan</div>
            </div>
            <div>
              <div className="font-mono tabular-nums text-lg font-semibold text-white">4 Tools</div>
              <div className="text-xs text-zinc-400 mt-0.5">Always-unlocked AI</div>
            </div>
            <div>
              <div className="font-mono tabular-nums text-lg font-semibold text-white">50 Tx</div>
              <div className="text-xs text-zinc-400 mt-0.5">Live on-chain depth</div>
            </div>
          </div>
        </div>

        {/* Auth Card */}
        <div className="lg:col-span-6">
          <div className="bg-[#13151B] border border-white/[0.08] rounded-2xl p-6 sm:p-8 max-w-md w-full mx-auto">
            <div className="flex items-center gap-1 p-1 bg-[#0A0B0E] rounded-xl border border-white/[0.06] mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setGoogleNotice(null);
                }}
                className={`flex-1 min-h-[44px] text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  mode === 'login'
                    ? 'bg-[#1D2029] text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                  setGoogleNotice(null);
                }}
                className={`flex-1 min-h-[44px] text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  mode === 'signup'
                    ? 'bg-[#1D2029] text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Create Account
              </button>
            </div>

            <button
              type="button"
              onClick={handleGoogleContinue}
              disabled={loading}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#1A1D25] hover:bg-[#222631] border border-white/[0.09] text-sm font-medium text-white flex items-center justify-center gap-3 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.6-2.5C16.9 3.5 14.7 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            {googleNotice && (
              <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200 leading-relaxed">
                {googleNotice}
              </div>
            )}

            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1 bg-white/[0.07]" />
              <span className="text-xs text-zinc-500">or with email</span>
              <div className="h-px flex-1 bg-white/[0.07]" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="auth-email" className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="trader@domain.com"
                    className="w-full min-h-[46px] pl-10 pr-4 bg-[#0A0B0E] border border-white/[0.09] focus:border-[#14F195] focus:outline-none rounded-xl text-sm text-white placeholder:text-zinc-600 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-medium text-zinc-300 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full min-h-[46px] pl-10 pr-4 bg-[#0A0B0E] border border-white/[0.09] focus:border-[#14F195] focus:outline-none rounded-xl text-sm text-white placeholder:text-zinc-600 transition-colors"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#14F195] hover:bg-[#11d984] active:scale-[0.99] text-[#0A0B0E] font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              >
                <span>
                  {loading
                    ? 'Please wait…'
                    : mode === 'signup'
                      ? 'Create Free Account'
                      : 'Sign In to SolidusX AI'}
                </span>
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>

            <p className="mt-5 text-[11px] text-zinc-500 text-center leading-relaxed">
              Free accounts include 1 daily Solana wallet scan, all 4 AI tools unlocked, and
              one-click account deletion in Settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
