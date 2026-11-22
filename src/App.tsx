import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  BellRing,
  Search,
  Settings,
  Sparkles,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { AiFeatureCards, type AiFeatureType } from './components/AiFeatureCards';
import { AiFeatureSheet } from './components/AiFeatureSheet';
import { AuthScreen } from './components/AuthScreen';
import { FreeBannerAd } from './components/FreeBannerAd';
import { Header, type AppTab } from './components/Header';
import { MetricGrid } from './components/MetricGrid';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ScanLimitModal } from './components/ScanLimitModal';
import { SettingsView } from './components/SettingsView';
import { SolPriceSparklineCard } from './components/SolPriceSparklineCard';
import { TokenPriceAlerts } from './components/TokenPriceAlerts';
import { UpgradeModal } from './components/UpgradeModal';
import { usePriceAlerts } from './hooks/usePriceAlerts';
import {
  ApiError,
  analyzeWallet,
  claimRewardedAdScan,
  deleteAccount,
  fetchProfile,
  fetchSolHistory,
  upgradeTier,
} from './lib/api';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import type { SolPriceHistory, SubscriptionTier, UserProfile, WalletAnalysis } from './types';

const QUICK_TEST_WALLETS = [
  { label: 'Active DeFi Wallet', address: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4' },
  { label: 'Treasury Wallet', address: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1' },
];

const AUTH_TOKEN_STORAGE_KEY = 'solidusx_session_token_v1';
const AUTH_PROFILE_STORAGE_KEY = 'solidusx_session_profile_v1';

function normalizeLifetimeSuperProfile(profile: UserProfile): UserProfile {
  if (profile.email.trim().toLowerCase() === 'sunilkuri804@gmail.com') {
    return {
      ...profile,
      tier: 'Super',
      dailyLimit: null,
      maxAdScansPerDay: 0,
    };
  }
  return profile;
}

function savePersistedSession(token: string, profile: UserProfile): void {
  try {
    const normalized = normalizeLifetimeSuperProfile(profile);
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    window.localStorage.setItem(AUTH_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage quota errors
  }
}

function loadPersistedSession(): { token: string; profile: UserProfile | null } | null {
  try {
    const savedToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!savedToken) return null;
    const rawProfile = window.localStorage.getItem(AUTH_PROFILE_STORAGE_KEY);
    const parsedProfile = rawProfile
      ? normalizeLifetimeSuperProfile(JSON.parse(rawProfile) as UserProfile)
      : null;
    return { token: savedToken, profile: parsedProfile };
  } catch {
    return null;
  }
}

function clearPersistedSession(): void {
  try {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_PROFILE_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export default function App() {
  const [authInitializing, setAuthInitializing] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('analyzer');

  const [walletInput, setWalletInput] = useState('');
  const [analysis, setAnalysis] = useState<WalletAnalysis | null>(null);
  const [solHistory, setSolHistory] = useState<SolPriceHistory | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [activeAiFeature, setActiveAiFeature] = useState<AiFeatureType | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [scanLimitOpen, setScanLimitOpen] = useState(false);

  const {
    alerts,
    prices: tokenPrices,
    refreshing: pricesRefreshing,
    notifications: alertNotifications,
    browserPermission,
    refreshPrices,
    addAlert,
    removeAlert,
    rearmAlert,
    dismissNotification,
    requestBrowserPermission,
  } = usePriceAlerts(profile?.id ?? null, analysis);

  // Load 7-day SOL price trend for the dashboard sparkline
  useEffect(() => {
    let active = true;
    fetchSolHistory()
      .then((data) => {
        if (active) setSolHistory(data);
      })
      .catch(() => {
        // Non-blocking sparkline fetch
      });
    return () => {
      active = false;
    };
  }, []);

  // Keep persisted session cache in sync when tier or daily checks update
  useEffect(() => {
    if (token && profile) {
      savePersistedSession(token, profile);
    }
  }, [token, profile]);

  // Check Supabase session and subscribe to auth state changes before rendering login screen
  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        clearPersistedSession();
        setToken(null);
        setProfile(null);
        setAuthInitializing(false);
        return;
      }

      const accessToken = session?.access_token;
      if (accessToken && isSupabaseConfigured) {
        try {
          const { profile: fetched } = await fetchProfile(accessToken);
          if (!mounted) return;
          savePersistedSession(accessToken, fetched);
          setToken(accessToken);
          setProfile(fetched);
        } catch {
          // Non-blocking; restoreSession handles fallback
        } finally {
          if (mounted) setAuthInitializing(false);
        }
      }
    });

    const restoreSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;

        if (accessToken && isSupabaseConfigured) {
          const { profile: fetched } = await fetchProfile(accessToken);
          if (!mounted) return;
          savePersistedSession(accessToken, fetched);
          setToken(accessToken);
          setProfile(fetched);
          return;
        }

        const saved = loadPersistedSession();
        if (saved?.token) {
          try {
            const { profile: fetched } = await fetchProfile(saved.token);
            if (!mounted) return;
            savePersistedSession(saved.token, fetched);
            setToken(saved.token);
            setProfile(fetched);
          } catch (err) {
            if (!mounted) return;
            if (err instanceof ApiError && err.status === 401) {
              clearPersistedSession();
            } else if (saved.profile) {
              setToken(saved.token);
              setProfile(saved.profile);
            }
          }
        }
      } catch {
        // Ignore session check failure and show login screen cleanly
      } finally {
        if (mounted) setAuthInitializing(false);
      }
    };

    void restoreSession();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleAuthenticated = useCallback((newToken: string, newProfile: UserProfile) => {
    savePersistedSession(newToken, newProfile);
    setToken(newToken);
    setProfile(newProfile);
    setActiveTab('analyzer');
    setAuthInitializing(false);
  }, []);

  const handleSignOut = useCallback(async () => {
    clearPersistedSession();
    await supabase.auth.signOut().catch(() => {});
    setToken(null);
    setProfile(null);
    setAnalysis(null);
    setWalletInput('');
    setScanError(null);
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    if (!token) return;
    await deleteAccount(token);
    clearPersistedSession();
    await supabase.auth.signOut().catch(() => {});
    setToken(null);
    setProfile(null);
    setAnalysis(null);
    setWalletInput('');
  }, [token]);

  const handleScanWallet = async (overrideAddress?: string) => {
    if (!token || !profile) return;
    const trimmed = (overrideAddress ?? walletInput).trim();
    setWalletInput(trimmed);
    setScanError(null);

    if (!trimmed) {
      setScanError('Please paste a public Solana wallet address to scan.');
      return;
    }

    setScanLoading(true);
    try {
      const res = await analyzeWallet(token, trimmed);
      setAnalysis(res.analysis);
      setProfile(res.profile);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DAILY_LIMIT_REACHED') {
        if (err.profile) setProfile(err.profile);
        setScanLimitOpen(true);
      } else {
        setScanError(err instanceof Error ? err.message : 'Unable to scan wallet.');
      }
    } finally {
      setScanLoading(false);
    }
  };

  const handleUpgradeTier = async (tier: SubscriptionTier) => {
    if (!token) return;
    const res = await upgradeTier(token, tier);
    setProfile(res.profile);
  };

  const handleClaimRewardedAd = async () => {
    if (!token) return;
    const res = await claimRewardedAdScan(token);
    setProfile(res.profile);
  };

  if (authInitializing) {
    return (
      <div className="min-h-screen bg-[#0A0B0E] text-[#F3F4F6] flex flex-col items-center justify-center gap-3 px-4">
        <div className="w-11 h-11 rounded-2xl bg-[#14F195]/15 border border-[#14F195]/30 flex items-center justify-center text-[#14F195] animate-pulse">
          <Zap className="w-5 h-5 fill-[#14F195]" />
        </div>
        <div className="font-display text-base font-semibold text-white tracking-tight">
          SolidusX AI
        </div>
        <div className="text-xs text-zinc-500">Checking session…</div>
      </div>
    );
  }

  if (!token || !profile) {
    return (
      <>
        <AuthScreen onAuthenticated={handleAuthenticated} />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-[#F3F4F6] flex flex-col">
      <Header
        profile={profile}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenUpgrade={() => setUpgradeOpen(true)}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-5 pb-24 md:pb-12 space-y-6">
        {activeTab === 'analyzer' && (
          <>
            {/* Wallet Search + 7-Day Solana (SOL) Price Sparkline */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              <section className="lg:col-span-8 bg-[#13151B] border border-white/[0.07] rounded-2xl p-4 sm:p-6 flex flex-col justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-white">
                      Solana Wallet Analyzer
                    </h1>
                    <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                      Inspect any public Solana address for real PnL, swaps, win rate, and gas
                      fees. No wallet connect required.
                    </p>
                  </div>
                  {analysis && (
                    <div className="text-xs text-zinc-400 font-mono tabular-nums whitespace-nowrap shrink-0">
                      Bal {analysis.solBalance.toFixed(3)} SOL
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleScanWallet();
                  }}
                  className="flex flex-col sm:flex-row gap-2.5"
                >
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={walletInput}
                      onChange={(e) => setWalletInput(e.target.value)}
                      placeholder="Enter public Solana wallet address (e.g. JUP6Lkb…)"
                      aria-label="Solana wallet address"
                      className="w-full min-h-[46px] pl-10 pr-4 bg-[#0A0B0E] border border-white/[0.09] focus:border-[#14F195] focus:outline-none rounded-xl font-mono text-xs sm:text-sm text-white placeholder:text-zinc-600 transition-colors"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={scanLoading}
                    className="min-h-[46px] px-6 py-2.5 rounded-xl bg-[#14F195] hover:bg-[#11d984] active:scale-[0.99] text-[#0A0B0E] font-semibold text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-all disabled:opacity-60"
                  >
                    <Zap className="w-4 h-4 fill-[#0A0B0E]" />
                    <span>{scanLoading ? 'Scanning…' : 'Scan Wallet'}</span>
                  </button>
                </form>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-zinc-500">Try live mainnet address:</span>
                  {QUICK_TEST_WALLETS.map((w) => (
                    <button
                      key={w.address}
                      type="button"
                      onClick={() => void handleScanWallet(w.address)}
                      className="px-2.5 py-1 rounded-lg bg-[#0A0B0E] hover:bg-[#1A1D25] border border-white/[0.07] text-zinc-300 transition-colors"
                    >
                      {w.label}
                    </button>
                  ))}
                </div>

                {scanError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300">
                    {scanError}
                  </div>
                )}
              </section>

              <div className="lg:col-span-4 order-first lg:order-last">
                <SolPriceSparklineCard
                  solHistory={solHistory}
                  liveSpotPrice={analysis?.solPriceUsd}
                />
              </div>
            </div>

            {/* 4 Core Wallet Metrics */}
            <MetricGrid analysis={analysis} loading={scanLoading} />

            {/* Portfolio Token Holdings & Price Alerts */}
            <TokenPriceAlerts
              analysis={analysis}
              alerts={alerts}
              prices={tokenPrices}
              refreshing={pricesRefreshing}
              browserPermission={browserPermission}
              onRefreshPrices={refreshPrices}
              onAddAlert={addAlert}
              onRemoveAlert={removeAlert}
              onRearmAlert={rearmAlert}
              onRequestBrowserPermission={requestBrowserPermission}
            />

            {/* 4 AI Feature Cards (locked with Pro badge for Free users) */}
            <AiFeatureCards
              isFreeTier={profile.tier === 'Free'}
              onUpgradeRequired={() => setUpgradeOpen(true)}
              onSelectFeature={(f) =>
                profile.tier === 'Free' ? setUpgradeOpen(true) : setActiveAiFeature(f)
              }
              hasScannedWallet={Boolean(analysis)}
              tradesCount={analysis?.tradesCount ?? 0}
            />

            {/* Recent On-Chain Activity (when transactions exist) */}
            {analysis && analysis.recentTransactions.length > 0 && (
              <section className="bg-[#13151B] border border-white/[0.07] rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#14F195]" />
                    <h2 className="font-display text-base font-bold text-white">
                      Recent On-Chain Activity
                    </h2>
                  </div>
                  <span className="text-xs text-zinc-400 font-mono tabular-nums">
                    Latest {analysis.recentTransactions.length} txs
                  </span>
                </div>

                <div className="divide-y divide-white/[0.05]">
                  {analysis.recentTransactions.map((tx) => {
                    const positive = tx.solDelta >= 0;
                    return (
                      <div
                        key={tx.signature}
                        className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              positive
                                ? 'bg-[#14F195]/10 text-[#14F195]'
                                : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {positive ? (
                              <ArrowDownLeft className="w-4 h-4" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-medium text-zinc-100 truncate">
                              {tx.summary}
                            </div>
                            <div className="text-[11px] text-zinc-500 flex items-center gap-2 mt-0.5">
                              <span>{tx.type}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">
                                {tx.signature.slice(0, 6)}…{tx.signature.slice(-4)}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{new Date(tx.timestamp).toLocaleDateString('en-US')}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div
                            className={`font-mono tabular-nums text-xs sm:text-sm font-semibold ${
                              positive ? 'text-[#14F195]' : 'text-rose-400'
                            }`}
                          >
                            {positive ? '+' : ''}
                            {tx.solDelta.toFixed(4)} SOL
                          </div>
                          <div className="font-mono tabular-nums text-[11px] text-zinc-500">
                            Fee {tx.feeSol.toFixed(5)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Free Plan Bottom Banner Ad (hidden for Pro and Super) */}
            <FreeBannerAd profile={profile} onOpenUpgrade={() => setUpgradeOpen(true)} />
          </>
        )}

        {activeTab === 'ai-suite' && (
          <div className="space-y-6">
            <div className="bg-[#13151B] border border-white/[0.07] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl font-bold text-white tracking-tight">
                  SolidusX AI Suite
                </h1>
                <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                  {profile.tier === 'Free'
                    ? 'Upgrade to Pro or Super to unlock all 4 Gemini AI trading tools.'
                    : analysis
                      ? `Active context: ${analysis.walletAddress.slice(0, 6)}…${analysis.walletAddress.slice(-4)} (${analysis.tradesCount} trades, $${analysis.totalNetPnlUsd.toFixed(2)} PnL)`
                      : 'No wallet scanned yet — all 4 Gemini AI tools are unlocked and ready.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('analyzer')}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0A0B0E] hover:bg-[#1A1D25] border border-white/[0.08] text-xs font-medium text-white whitespace-nowrap shrink-0"
              >
                {analysis ? 'Scan Another Wallet' : 'Go to Wallet Scanner'}
              </button>
            </div>

            <AiFeatureCards
              isFreeTier={profile.tier === 'Free'}
              onUpgradeRequired={() => setUpgradeOpen(true)}
              onSelectFeature={(f) =>
                profile.tier === 'Free' ? setUpgradeOpen(true) : setActiveAiFeature(f)
              }
              hasScannedWallet={Boolean(analysis)}
              tradesCount={analysis?.tradesCount ?? 0}
            />

            <FreeBannerAd profile={profile} onOpenUpgrade={() => setUpgradeOpen(true)} />
          </div>
        )}

        {activeTab === 'settings' && (
          <SettingsView
            profile={profile}
            onOpenUpgrade={() => setUpgradeOpen(true)}
            onSignOut={handleSignOut}
            onDeleteAccount={handleDeleteAccount}
          />
        )}
      </main>

      {/* Mobile Fixed Thumb-Zone Bottom Tab Bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-[#0A0B0E]/95 backdrop-blur-md border-t border-white/[0.07] grid grid-cols-3"
      >
        {(
          [
            { id: 'analyzer', label: 'Analyzer', icon: Wallet },
            { id: 'ai-suite', label: 'AI Suite', icon: Sparkles },
            { id: 'settings', label: 'Settings', icon: Settings },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors ${
                active ? 'text-[#14F195]' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[11px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Interactive Modals & Sheets */}
      <AiFeatureSheet
        feature={activeAiFeature}
        token={token}
        walletContext={analysis}
        onClose={() => setActiveAiFeature(null)}
        onUpgradeRequired={() => setUpgradeOpen(true)}
      />

      <UpgradeModal
        open={upgradeOpen}
        token={token}
        currentTier={profile.tier}
        onClose={() => setUpgradeOpen(false)}
        onSelectFreeTier={() => handleUpgradeTier('Free')}
        onPaymentActivated={(updatedProfile) => setProfile(updatedProfile)}
      />

      <ScanLimitModal
        open={scanLimitOpen}
        adScansToday={profile.adScansToday ?? 0}
        maxAdScans={profile.maxAdScansPerDay ?? 2}
        onClose={() => setScanLimitOpen(false)}
        onUpgradeToPro={() => setUpgradeOpen(true)}
        onClaimRewardedAd={handleClaimRewardedAd}
      />

      <div className="fixed bottom-16 right-4 md:bottom-5 md:right-5 z-40">
        <PWAInstallButton compact />
      </div>

      {/* Live Triggered Price Alert Notifications */}
      {alertNotifications.length > 0 && (
        <div
          aria-live="polite"
          className="fixed top-[72px] right-4 left-4 sm:left-auto sm:w-96 z-50 space-y-2 pointer-events-none"
        >
          {alertNotifications.map((note) => (
            <div
              key={note.alertId}
              role="status"
              className="pointer-events-auto bg-[#13151B] border border-[#14F195]/45 rounded-2xl p-3.5 shadow-xl flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#14F195]/15 text-[#14F195] flex items-center justify-center shrink-0">
                  <BellRing className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">
                    Price Alert Triggered: {note.symbol}
                  </div>
                  <div className="font-mono tabular-nums text-[11px] text-zinc-300 mt-0.5">
                    {note.condition === 'above' ? 'Crossed ≥' : 'Dropped ≤'} $
                    {note.targetPriceUsd < 0.01
                      ? note.targetPriceUsd.toFixed(6)
                      : note.targetPriceUsd < 1
                        ? note.targetPriceUsd.toFixed(4)
                        : note.targetPriceUsd.toFixed(2)}{' '}
                    · Live $
                    {note.livePriceUsd < 0.01
                      ? note.livePriceUsd.toFixed(6)
                      : note.livePriceUsd < 1
                        ? note.livePriceUsd.toFixed(4)
                        : note.livePriceUsd.toFixed(2)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismissNotification(note.alertId)}
                aria-label={`Dismiss ${note.symbol} alert notification`}
                className="min-h-[32px] min-w-[32px] rounded-lg hover:bg-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}
