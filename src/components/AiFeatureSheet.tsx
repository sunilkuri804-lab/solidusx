import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Clock,
  Flame,
  MessageSquare,
  Radar,
  RefreshCw,
  Send,
  Share2,
  X,
  Zap,
} from 'lucide-react';
import {
  ApiError,
  decodeWhaleWallet,
  generateRoast,
  generateWhatIf,
  sendCoachMessage,
} from '../lib/api';
import type {
  CoachMessage,
  RoastResult,
  WalletAnalysis,
  WhaleDecodeResult,
  WhatIfResult,
} from '../types';
import type { AiFeatureType } from './AiFeatureCards';

interface AiFeatureSheetProps {
  feature: AiFeatureType | null;
  token: string;
  walletContext: WalletAnalysis | null;
  onClose: () => void;
  onUpgradeRequired: () => void;
}

const SAMPLE_WHALES = [
  { label: 'Jupiter Aggregator Treasury', address: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4' },
  { label: 'Active Solana Trader', address: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1' },
];

export const AiFeatureSheet: React.FC<AiFeatureSheetProps> = ({
  feature,
  token,
  walletContext,
  onClose,
  onUpgradeRequired,
}) => {
  // Roast state
  const [roast, setRoast] = useState<RoastResult | null>(null);
  const [roastLoading, setRoastLoading] = useState(false);
  const [roastError, setRoastError] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);

  // What-if state
  const [whatIf, setWhatIf] = useState<WhatIfResult | null>(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);

  // Whale decoder state
  const [whaleAddress, setWhaleAddress] = useState('');
  const [whaleResult, setWhaleResult] = useState<WhaleDecodeResult | null>(null);
  const [whaleLoading, setWhaleLoading] = useState(false);
  const [whaleError, setWhaleError] = useState<string | null>(null);

  // Coach chat state
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);
  const [coachInput, setCoachInput] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Reset contextual coach greeting when scanned wallet changes
  useEffect(() => {
    const addrLabel = walletContext?.walletAddress
      ? `${walletContext.walletAddress.slice(0, 6)}…${walletContext.walletAddress.slice(-4)}`
      : 'your portfolio';
    setCoachMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: walletContext
          ? `I have reviewed ${addrLabel}: ${walletContext.tradesCount} trades, ${walletContext.winRate.toFixed(1)}% win rate, $${walletContext.totalNetPnlUsd.toFixed(2)} net PnL, and $${walletContext.totalGasFeesUsd.toFixed(2)} in gas fees. Ask me anything about position sizing, entry timing, or reducing fee drag.`
          : 'Welcome to SolidusX AI Coach. Scan any public Solana wallet for tailored advice, or ask me any question about Solana trading strategy, risk management, or execution.',
        createdAt: new Date().toISOString(),
      },
    ]);
    setRoast(null);
    setWhatIf(null);
  }, [walletContext?.walletAddress]);

  useEffect(() => {
    if (feature === 'roast' && !roast && !roastLoading) {
      void runRoast();
    } else if (feature === 'what-if' && !whatIf && !whatIfLoading) {
      void runWhatIf();
    } else if (feature === 'whale' && !whaleAddress && walletContext?.walletAddress) {
      setWhaleAddress(walletContext.walletAddress);
    }
  }, [feature]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [coachMessages, coachLoading]);

  if (!feature) return null;

  const runRoast = async () => {
    setRoastError(null);
    setRoastLoading(true);
    try {
      const res = await generateRoast(token, walletContext);
      setRoast({
        roastTitle: res?.roastTitle || 'Wallet Reality Check',
        lines: Array.isArray(res?.lines) ? res.lines : [],
        verdict: res?.verdict || 'Keep your risk tight and your entries deliberate.',
        cached: res?.cached,
        expiresAt: res?.expiresAt,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PRO_REQUIRED') {
        onClose();
        onUpgradeRequired();
        return;
      }
      setRoastError(err instanceof Error ? err.message : 'Unable to generate roast.');
    } finally {
      setRoastLoading(false);
    }
  };

  const handleShareRoast = async () => {
    if (!roast) return;
    const shareText = [
      `SolidusX AI Roast — ${roast.roastTitle}`,
      '',
      ...roast.lines,
      '',
      `Verdict: ${roast.verdict}`,
    ].join('\n');

    if (navigator.share) {
      try {
        await navigator.share({ title: 'SolidusX AI Trade Roast', text: shareText });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2200);
    } catch {
      setRoastError('Clipboard access unavailable. Please select and copy the roast text.');
    }
  };

  const runWhatIf = async () => {
    setWhatIfError(null);
    setWhatIfLoading(true);
    try {
      const res = await generateWhatIf(token, walletContext);
      setWhatIf({
        summary: res?.summary || '',
        totalMissedUsd: Number(res?.totalMissedUsd ?? 0),
        scenarios: Array.isArray(res?.scenarios) ? res.scenarios : [],
        cached: res?.cached,
        expiresAt: res?.expiresAt,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PRO_REQUIRED') {
        onClose();
        onUpgradeRequired();
        return;
      }
      setWhatIfError(err instanceof Error ? err.message : 'Unable to simulate missed profits.');
    } finally {
      setWhatIfLoading(false);
    }
  };

  const runWhaleDecode = async (overrideAddress?: string) => {
    const target = (overrideAddress ?? whaleAddress).trim();
    if (!target) {
      setWhaleError('Please enter a public Solana wallet address to decode.');
      return;
    }
    setWhaleAddress(target);
    setWhaleError(null);
    setWhaleLoading(true);
    try {
      const res = await decodeWhaleWallet(token, target);
      setWhaleResult(res);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PRO_REQUIRED') {
        onClose();
        onUpgradeRequired();
        return;
      }
      setWhaleError(err instanceof Error ? err.message : 'Unable to decode wallet.');
    } finally {
      setWhaleLoading(false);
    }
  };

  const handleSendCoach = async (promptOverride?: string) => {
    const text = (promptOverride ?? coachInput).trim();
    if (!text || coachLoading) return;

    const userMsg: CoachMessage = {
      id: `${Date.now()}-u`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    const nextHistory = [...coachMessages, userMsg];
    setCoachMessages(nextHistory);
    setCoachInput('');
    setCoachError(null);
    setCoachLoading(true);

    try {
      const res = await sendCoachMessage(token, walletContext, coachMessages, text);
      const aiMsg: CoachMessage = {
        id: `${Date.now()}-a`,
        role: 'assistant',
        content: res.reply,
        createdAt: new Date().toISOString(),
      };
      setCoachMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PRO_REQUIRED') {
        onClose();
        onUpgradeRequired();
        return;
      }
      setCoachError(err instanceof Error ? err.message : 'AI Coach failed to respond.');
    } finally {
      setCoachLoading(false);
    }
  };

  const meta = {
    roast: { title: 'AI Roast Card', icon: Flame, subtitle: '4-line honest portfolio roast' },
    'what-if': {
      title: 'What-If Time Machine',
      icon: Clock,
      subtitle: 'Missed-profit & early-exit simulator',
    },
    whale: {
      title: 'Copy-Whale Decoder',
      icon: Radar,
      subtitle: 'Entry/exit strategy & conviction score',
    },
    coach: {
      title: 'AI Coach Chat',
      icon: MessageSquare,
      subtitle: 'English trading coach with wallet memory',
    },
  }[feature];

  const HeaderIcon = meta.icon;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
    >
      <div className="bg-[#13151B] border border-white/[0.1] rounded-t-3xl sm:rounded-2xl w-full sm:max-w-xl max-h-[88vh] flex flex-col overflow-hidden">
        {/* Sheet Drag Handle (mobile) */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.07] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#14F195]/10 border border-[#14F195]/25 flex items-center justify-center text-[#14F195] shrink-0">
              <HeaderIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-base sm:text-lg font-bold text-white truncate">
                {meta.title}
              </h3>
              <p className="text-xs text-zinc-400 truncate">{meta.subtitle}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-white transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* 1. AI ROAST CARD */}
          {feature === 'roast' && (
            <>
              {roastLoading && (
                <div className="p-6 rounded-2xl bg-[#0A0B0E] border border-white/[0.06] space-y-3 animate-pulse">
                  <div className="h-4 w-40 bg-white/[0.08] rounded" />
                  <div className="h-3.5 w-full bg-white/[0.06] rounded" />
                  <div className="h-3.5 w-11/12 bg-white/[0.06] rounded" />
                  <div className="h-3.5 w-4/5 bg-white/[0.06] rounded" />
                  <div className="h-3.5 w-3/4 bg-white/[0.06] rounded" />
                </div>
              )}

              {roastError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 space-y-3">
                  <p>{roastError}</p>
                  <button
                    type="button"
                    onClick={runRoast}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-500/20 text-white font-medium"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {roast && !roastLoading && (
                <div className="space-y-4">
                  <div className="bg-[#0A0B0E] border border-white/[0.08] rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-[#14F195] fill-[#14F195]" />
                        <span className="font-display text-sm font-bold text-white">
                          {roast.roastTitle}
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-500">
                        {roast.cached ? '10m cache' : 'Fresh analysis'}
                      </span>
                    </div>

                    <div className="space-y-2.5 text-sm text-zinc-100 leading-relaxed">
                      {(roast.lines ?? []).map((line, i) => (
                        <p key={i} className="py-1 border-b border-white/[0.05] last:border-none">
                          {line}
                        </p>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-white/[0.07] text-xs text-[#14F195]">
                      Verdict: {roast.verdict}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleShareRoast}
                      className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-[#14F195] hover:bg-[#11d984] text-[#0A0B0E] font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
                    >
                      {copiedShare ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Copied Roast Card</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-4 h-4" />
                          <span>Share Roast</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={runRoast}
                      aria-label="Refresh roast"
                      className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#1A1D25] hover:bg-[#232732] border border-white/[0.08] text-sm font-medium text-zinc-200 flex items-center gap-2 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 2. WHAT-IF TIME MACHINE */}
          {feature === 'what-if' && (
            <>
              {whatIfLoading && (
                <div className="p-6 rounded-2xl bg-[#0A0B0E] border border-white/[0.06] space-y-3 animate-pulse">
                  <div className="h-5 w-48 bg-white/[0.08] rounded" />
                  <div className="h-16 w-full bg-white/[0.06] rounded-xl" />
                  <div className="h-16 w-full bg-white/[0.06] rounded-xl" />
                </div>
              )}

              {whatIfError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 space-y-3">
                  <p>{whatIfError}</p>
                  <button
                    type="button"
                    onClick={runWhatIf}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-500/20 text-white font-medium"
                  >
                    Retry Simulation
                  </button>
                </div>
              )}

              {whatIf && !whatIfLoading && (
                <div className="space-y-4">
                  <div className="bg-[#0A0B0E] border border-white/[0.08] rounded-2xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs text-zinc-400">Simulated Missed Upside</div>
                      <div className="font-mono tabular-nums text-2xl font-bold text-[#14F195] mt-0.5">
                        +$
                        {(whatIf.totalMissedUsd ?? 0).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                    </div>
                    <span className="text-[11px] text-zinc-500">
                      {whatIf.cached ? '10m cache' : 'Fresh simulation'}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                    {whatIf.summary}
                  </p>

                  <div className="space-y-2.5">
                    {(whatIf.scenarios ?? []).map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-[#0A0B0E] border border-white/[0.07] rounded-xl p-4 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display text-sm font-semibold text-white">
                            {item.token}
                          </span>
                          <span className="font-mono tabular-nums text-xs font-semibold text-[#14F195]">
                            +$
                            {(item.missedGainUsd ?? 0).toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-400">{item.action}</div>
                        <div className="text-xs text-zinc-500 flex flex-wrap gap-x-2">
                          <span>Actual: {item.actualOutcome}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-zinc-300">Held: {item.simulatedOutcome}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 3. COPY-WHALE DECODER */}
          {feature === 'whale' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="whale-wallet-input" className="block text-xs text-zinc-300">
                  Target Solana Wallet Address
                </label>
                <div className="flex gap-2">
                  <input
                    id="whale-wallet-input"
                    type="text"
                    value={whaleAddress}
                    onChange={(e) => setWhaleAddress(e.target.value)}
                    placeholder="Paste top trader or whale address"
                    className="flex-1 min-h-[44px] px-3.5 bg-[#0A0B0E] border border-white/[0.09] focus:border-[#14F195] focus:outline-none rounded-xl font-mono text-xs text-white placeholder:text-zinc-600"
                  />
                  <button
                    type="button"
                    disabled={whaleLoading}
                    onClick={() => runWhaleDecode()}
                    className="min-h-[44px] px-4 rounded-xl bg-[#14F195] hover:bg-[#11d984] text-[#0A0B0E] text-xs font-semibold whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    {whaleLoading ? 'Decoding…' : 'Decode'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {SAMPLE_WHALES.map((s) => (
                    <button
                      key={s.address}
                      type="button"
                      onClick={() => runWhaleDecode(s.address)}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-[#0A0B0E] hover:bg-[#1A1D25] border border-white/[0.07] text-zinc-300 transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {whaleError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300">
                  {whaleError}
                </div>
              )}

              {whaleLoading && (
                <div className="p-5 rounded-2xl bg-[#0A0B0E] border border-white/[0.06] space-y-3 animate-pulse">
                  <div className="h-5 w-44 bg-white/[0.08] rounded" />
                  <div className="h-12 w-full bg-white/[0.06] rounded" />
                  <div className="h-12 w-full bg-white/[0.06] rounded" />
                </div>
              )}

              {whaleResult && !whaleLoading && (
                <div className="bg-[#0A0B0E] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-zinc-400">Trader Archetype</div>
                      <div className="font-display text-base font-bold text-white">
                        {whaleResult.archetype}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-zinc-400">Conviction Score</div>
                      <div className="font-mono tabular-nums text-xl font-bold text-[#14F195]">
                        {whaleResult.convictionScore}/100
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2.5 border-y border-white/[0.06] text-xs">
                    <div>
                      <div className="text-zinc-500">Trades</div>
                      <div className="font-mono tabular-nums font-semibold text-white mt-0.5">
                        {whaleResult.metrics.tradesCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500">Win Rate</div>
                      <div className="font-mono tabular-nums font-semibold text-white mt-0.5">
                        {whaleResult.metrics.winRate.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500">SOL Balance</div>
                      <div className="font-mono tabular-nums font-semibold text-white mt-0.5">
                        {whaleResult.metrics.solBalance.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5 text-xs leading-relaxed">
                    <div>
                      <span className="text-zinc-400 font-medium">Entry Style: </span>
                      <span className="text-zinc-200">{whaleResult.entryStyle}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400 font-medium">Exit Discipline: </span>
                      <span className="text-zinc-200">{whaleResult.exitDiscipline}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400 font-medium">Risk Profile: </span>
                      <span className="text-zinc-200">{whaleResult.riskProfile}</span>
                    </div>
                    <div className="pt-2 border-t border-white/[0.06] text-[#14F195]">
                      Takeaway: {whaleResult.actionableTakeaway}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. AI COACH CHAT */}
          {feature === 'coach' && (
            <div className="flex flex-col h-[52vh] sm:h-[420px]">
              <div
                ref={chatScrollRef}
                className="flex-1 overflow-y-auto space-y-3 pr-1 pb-3"
              >
                {(coachMessages ?? []).map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-[#14F195] text-[#0A0B0E] font-medium'
                          : 'bg-[#0A0B0E] border border-white/[0.08] text-zinc-200'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {coachLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[#0A0B0E] border border-white/[0.08] rounded-2xl px-4 py-2.5 text-xs text-zinc-400">
                      SolidusX Coach is thinking…
                    </div>
                  </div>
                )}
              </div>

              {coachMessages.length <= 1 && (
                <div className="flex flex-wrap gap-2 pb-3">
                  {[
                    'How can I improve my win rate?',
                    'Are my gas fees too high?',
                    'Give me 3 risk rules for Solana.',
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => handleSendCoach(prompt)}
                      className="text-[11px] px-3 py-1.5 rounded-xl bg-[#0A0B0E] hover:bg-[#1A1D25] border border-white/[0.08] text-zinc-300 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {coachError && (
                <div className="mb-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300">
                  {coachError}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSendCoach();
                }}
                className="flex items-center gap-2 pt-2 border-t border-white/[0.07]"
              >
                <input
                  type="text"
                  value={coachInput}
                  onChange={(e) => setCoachInput(e.target.value)}
                  placeholder="Ask your Solana AI coach…"
                  className="flex-1 min-h-[44px] px-3.5 bg-[#0A0B0E] border border-white/[0.09] focus:border-[#14F195] focus:outline-none rounded-xl text-sm text-white placeholder:text-zinc-600"
                />
                <button
                  type="submit"
                  disabled={coachLoading || !coachInput.trim()}
                  aria-label="Send message"
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-[#14F195] hover:bg-[#11d984] text-[#0A0B0E] flex items-center justify-center disabled:opacity-50 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
