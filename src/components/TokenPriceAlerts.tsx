import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BellRing,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { SOL_MINT } from '../hooks/usePriceAlerts';
import type {
  TokenPriceAlert,
  TokenPriceAlertCondition,
  TokenPriceQuote,
  WalletAnalysis,
} from '../types';

interface PortfolioTokenOption {
  mint: string;
  symbol: string;
  holdingLabel: string;
}

interface TokenPriceAlertsProps {
  analysis: WalletAnalysis | null;
  alerts: TokenPriceAlert[];
  prices: Record<string, TokenPriceQuote>;
  refreshing: boolean;
  browserPermission: NotificationPermission;
  onRefreshPrices: () => Promise<void>;
  onAddAlert: (
    mint: string,
    symbol: string,
    condition: TokenPriceAlertCondition,
    targetPriceUsd: number
  ) => void;
  onRemoveAlert: (id: string) => void;
  onRearmAlert: (id: string) => void;
  onRequestBrowserPermission: () => Promise<void>;
}

function formatTokenPrice(price: number): string {
  if (!(price > 0)) return '—';
  if (price < 0.0001) return `$${price.toFixed(8)}`;
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  return `$${price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const TokenPriceAlerts: React.FC<TokenPriceAlertsProps> = ({
  analysis,
  alerts,
  prices,
  refreshing,
  browserPermission,
  onRefreshPrices,
  onAddAlert,
  onRemoveAlert,
  onRearmAlert,
  onRequestBrowserPermission,
}) => {
  const portfolioTokens: PortfolioTokenOption[] = useMemo(() => {
    if (!analysis) return [];
    const list: PortfolioTokenOption[] = [
      {
        mint: SOL_MINT,
        symbol: 'SOL',
        holdingLabel: `${analysis.solBalance.toFixed(4)} SOL`,
      },
    ];
    const seen = new Set<string>([SOL_MINT]);
    for (const tok of analysis.topTokens) {
      if (!tok.mint || seen.has(tok.mint)) continue;
      seen.add(tok.mint);
      const liveQuote = prices[tok.mint];
      list.push({
        mint: tok.mint,
        symbol: liveQuote?.symbol || tok.symbol,
        holdingLabel:
          tok.netChange !== 0
            ? `${tok.netChange >= 0 ? '+' : ''}${tok.netChange.toLocaleString('en-US', {
                maximumFractionDigits: 2,
              })} net`
            : `${tok.txCount} txs`,
      });
    }
    return list;
  }, [analysis, prices]);

  const [selectedMint, setSelectedMint] = useState<string>(SOL_MINT);
  const [condition, setCondition] = useState<TokenPriceAlertCondition>('above');
  const [targetInput, setTargetInput] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (portfolioTokens.length > 0 && !portfolioTokens.some((t) => t.mint === selectedMint)) {
      setSelectedMint(portfolioTokens[0].mint);
    }
  }, [portfolioTokens, selectedMint]);

  const selectedToken = portfolioTokens.find((t) => t.mint === selectedMint) || portfolioTokens[0];
  const selectedQuote = selectedToken ? prices[selectedToken.mint] : undefined;

  const applyPresetOffset = (pctOffset: number) => {
    const base = selectedQuote?.priceUsd;
    if (!(base && base > 0)) return;
    const target = base * (1 + pctOffset / 100);
    const decimals = target < 0.01 ? 6 : target < 1 ? 4 : 2;
    setTargetInput(target.toFixed(decimals));
    setCondition(pctOffset >= 0 ? 'above' : 'below');
    setFormError(null);
  };

  const handleCreateAlert = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedToken) {
      setFormError('Scan a wallet first to choose a portfolio token.');
      return;
    }

    const parsed = Number(targetInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFormError('Enter a valid positive USD target price.');
      return;
    }

    onAddAlert(selectedToken.mint, selectedToken.symbol, condition, parsed);
    setTargetInput('');
  };

  const supportsBrowserNotifications =
    typeof window !== 'undefined' && 'Notification' in window;

  return (
    <section
      aria-labelledby="token-alerts-heading"
      className="bg-[#13151B] border border-white/[0.07] rounded-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#14F195]/10 border border-[#14F195]/20 flex items-center justify-center text-[#14F195] shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h2 id="token-alerts-heading" className="font-display text-base font-bold text-white">
              Portfolio Token Price Alerts
            </h2>
            <p className="text-xs text-zinc-400">
              {analysis
                ? `Monitoring ${portfolioTokens.length} portfolio ${
                    portfolioTokens.length === 1 ? 'token' : 'tokens'
                  } every 15s`
                : 'Scan a wallet above to set live price alerts on held tokens'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {supportsBrowserNotifications && browserPermission !== 'granted' && (
            <button
              type="button"
              onClick={() => void onRequestBrowserPermission()}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0A0B0E] hover:bg-[#1A1D25] border border-white/[0.08] text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 transition-colors"
            >
              <BellRing className="w-3.5 h-3.5 text-[#14F195]" />
              <span>Enable Desktop Alerts</span>
            </button>
          )}

          {(analysis || alerts.length > 0) && (
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void onRefreshPrices()}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0A0B0E] hover:bg-[#1A1D25] border border-white/[0.08] text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#14F195] ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Checking…' : 'Check Prices'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Scanned Portfolio Tokens Quick Strip + Add Alert Form */}
        {analysis && portfolioTokens.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {portfolioTokens.map((tok) => {
                const quote = prices[tok.mint];
                const selected = tok.mint === selectedToken?.mint;
                return (
                  <button
                    key={tok.mint}
                    type="button"
                    onClick={() => {
                      setSelectedMint(tok.mint);
                      setTargetInput('');
                      setFormError(null);
                    }}
                    className={`px-3 py-2 rounded-xl border text-left transition-colors flex items-center gap-2.5 ${
                      selected
                        ? 'bg-[#14F195]/10 border-[#14F195]/40 text-white'
                        : 'bg-[#0A0B0E] border-white/[0.07] text-zinc-300 hover:border-white/[0.16]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold flex items-center gap-1.5">
                        <span>{tok.symbol}</span>
                        <span className="font-mono tabular-nums text-[11px] text-zinc-400">
                          {quote ? formatTokenPrice(quote.priceUsd) : '—'}
                        </span>
                      </div>
                      <div className="font-mono tabular-nums text-[11px] text-zinc-500">
                        {tok.holdingLabel}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <form
              onSubmit={handleCreateAlert}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
            >
              <div className="sm:col-span-3">
                <label
                  htmlFor="alert-token-select"
                  className="block text-[11px] font-medium text-zinc-400 mb-1"
                >
                  Token
                </label>
                <select
                  id="alert-token-select"
                  value={selectedToken?.mint || ''}
                  onChange={(e) => {
                    setSelectedMint(e.target.value);
                    setTargetInput('');
                  }}
                  className="w-full min-h-[44px] px-3 bg-[#0A0B0E] border border-white/[0.09] focus:border-[#14F195] focus:outline-none rounded-xl text-xs sm:text-sm text-white"
                >
                  {portfolioTokens.map((tok) => (
                    <option key={tok.mint} value={tok.mint}>
                      {tok.symbol} ({tok.holdingLabel})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <span className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Trigger When
                </span>
                <div className="grid grid-cols-2 p-1 bg-[#0A0B0E] border border-white/[0.09] rounded-xl min-h-[44px]">
                  <button
                    type="button"
                    onClick={() => setCondition('above')}
                    className={`rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1 transition-colors ${
                      condition === 'above'
                        ? 'bg-[#1D2029] text-[#14F195]'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Above</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCondition('below')}
                    className={`rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1 transition-colors ${
                      condition === 'below'
                        ? 'bg-[#1D2029] text-rose-400'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    <span>Below</span>
                  </button>
                </div>
              </div>

              <div className="sm:col-span-4">
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="alert-target-price"
                    className="text-[11px] font-medium text-zinc-400"
                  >
                    Target Price (USD)
                  </label>
                  {selectedQuote && selectedQuote.priceUsd > 0 && (
                    <div className="flex items-center gap-1">
                      {[-5, 5, 10].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => applyPresetOffset(pct)}
                          className="px-1.5 py-0.5 rounded bg-[#0A0B0E] hover:bg-[#1A1D25] border border-white/[0.08] font-mono text-[10px] text-zinc-300"
                        >
                          {pct > 0 ? `+${pct}%` : `${pct}%`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  id="alert-target-price"
                  type="number"
                  step="any"
                  min="0"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  placeholder={
                    selectedQuote ? `Live ${formatTokenPrice(selectedQuote.priceUsd)}` : 'e.g. 75.00'
                  }
                  className="w-full min-h-[44px] px-3.5 bg-[#0A0B0E] border border-white/[0.09] focus:border-[#14F195] focus:outline-none rounded-xl font-mono tabular-nums text-xs sm:text-sm text-white placeholder:text-zinc-600"
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#14F195] hover:bg-[#11d984] text-[#0A0B0E] font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Alert</span>
                </button>
              </div>
            </form>

            {formError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300">
                {formError}
              </div>
            )}
          </div>
        )}

        {/* Active & Triggered Alerts List */}
        {alerts.length > 0 ? (
          <div className="divide-y divide-white/[0.06] border-t border-white/[0.06] pt-2">
            {alerts.map((alert) => {
              const live = prices[alert.mint];
              const triggered = Boolean(alert.triggeredAt);
              return (
                <div
                  key={alert.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        triggered
                          ? 'bg-[#14F195]/15 text-[#14F195]'
                          : 'bg-[#0A0B0E] border border-white/[0.08] text-zinc-400'
                      }`}
                    >
                      {triggered ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display text-sm font-semibold text-white">
                          {alert.symbol}
                        </span>
                        <span className="font-mono tabular-nums text-xs text-zinc-300">
                          {alert.condition === 'above' ? '≥' : '≤'}{' '}
                          {formatTokenPrice(alert.targetPriceUsd)}
                        </span>
                        <span
                          className={`text-[11px] font-medium ${
                            triggered ? 'text-[#14F195]' : 'text-zinc-400'
                          }`}
                        >
                          {triggered
                            ? `Triggered at ${formatTokenPrice(
                                alert.triggeredPriceUsd ?? alert.targetPriceUsd
                              )}`
                            : 'Armed'}
                        </span>
                      </div>
                      <div className="font-mono tabular-nums text-[11px] text-zinc-500 mt-0.5">
                        Live price: {live ? formatTokenPrice(live.priceUsd) : 'Fetching…'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {triggered && (
                      <button
                        type="button"
                        onClick={() => onRearmAlert(alert.id)}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[#0A0B0E] hover:bg-[#1A1D25] border border-white/[0.08] text-xs text-zinc-200 inline-flex items-center gap-1 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Re-arm</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveAlert(alert.id)}
                      aria-label={`Delete ${alert.symbol} alert`}
                      className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-rose-500/15 text-zinc-400 hover:text-rose-300 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          analysis && (
            <p className="text-xs text-zinc-500 pt-1">
              No price alerts armed yet. Select a token above and choose a target price to get
              notified automatically when it crosses your threshold.
            </p>
          )
        )}
      </div>
    </section>
  );
};
