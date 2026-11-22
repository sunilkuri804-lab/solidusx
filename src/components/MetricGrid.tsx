import React from 'react';
import { ArrowDownRight, ArrowUpRight, Fuel, Layers, TrendingUp } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import type { SolPriceHistory, WalletAnalysis } from '../types';

interface MetricGridProps {
  analysis: WalletAnalysis | null;
  solHistory: SolPriceHistory | null;
  loading: boolean;
}

function formatUsd(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

export const MetricGrid: React.FC<MetricGridProps> = ({ analysis, solHistory, loading }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4" aria-busy="true">
        <div className="lg:col-span-5 bg-[#13151B] border border-white/[0.07] rounded-2xl p-4 sm:p-5 h-[228px] animate-pulse">
          <div className="h-3 w-36 bg-white/[0.06] rounded mb-4" />
          <div className="h-7 w-40 bg-white/[0.08] rounded mb-4" />
          <div className="h-20 w-full bg-white/[0.05] rounded-xl" />
        </div>
        <div className="lg:col-span-7 grid grid-cols-2 gap-3 sm:gap-4">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="bg-[#13151B] border border-white/[0.07] rounded-2xl p-4 sm:p-5 h-[106px] animate-pulse"
            >
              <div className="h-3 w-20 bg-white/[0.06] rounded mb-4" />
              <div className="h-6 w-24 bg-white/[0.08] rounded mb-2" />
              <div className="h-3 w-16 bg-white/[0.05] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const pnlUsd = analysis ? analysis.totalNetPnlUsd : 0;
  const pnlSol = analysis ? analysis.totalNetPnlSol : 0;
  const trades = analysis ? analysis.tradesCount : 0;
  const winRate = analysis ? analysis.winRate : 0;
  const gasUsd = analysis ? analysis.totalGasFeesUsd : 0;
  const gasSol = analysis ? analysis.totalGasFeesSol : 0;
  const isPositivePnl = pnlUsd >= 0;

  const solBalance = analysis ? analysis.solBalance : 0;
  const liveSolPrice = analysis?.solPriceUsd ?? solHistory?.currentPriceUsd ?? 0;
  const balanceUsd = solBalance * liveSolPrice;
  const change7d = solHistory?.change7dPct ?? 0;
  const isPositive7d = change7d >= 0;
  const sparkColor = isPositive7d ? '#14F195' : '#F43F5E';
  const chartPoints = solHistory?.points ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-stretch">
        {/* Featured Card: SOL Balance & 7-Day Price Sparkline */}
        <div className="lg:col-span-5 bg-[#13151B] border border-white/[0.07] rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs text-zinc-400">SOL Balance &amp; 7D Trend</div>
              <div className="font-mono tabular-nums text-2xl font-bold tracking-tight text-white mt-1">
                {solBalance.toFixed(4)} <span className="text-sm font-semibold text-zinc-400">SOL</span>
              </div>
              <div className="font-mono tabular-nums text-xs text-zinc-500 mt-0.5">
                {analysis ? `Value ${formatUsd(balanceUsd)}` : 'Scan wallet to view balance'}
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="font-mono tabular-nums text-xs text-zinc-300 font-medium">
                {liveSolPrice > 0 ? `SOL ${formatUsd(liveSolPrice)}` : 'SOL —'}
              </div>
              <div
                className={`inline-flex items-center justify-end gap-0.5 font-mono tabular-nums text-xs font-semibold mt-0.5 ${
                  isPositive7d ? 'text-[#14F195]' : 'text-rose-400'
                }`}
              >
                {isPositive7d ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                )}
                <span>
                  {isPositive7d ? '+' : ''}
                  {change7d.toFixed(1)}% (7D)
                </span>
              </div>
            </div>
          </div>

          <div className="w-full h-[84px]" aria-label="7-day SOL price trend chart">
            {chartPoints.length > 0 ? (
              <ResponsiveContainer width="100%" height={84}>
                <AreaChart data={chartPoints} margin={{ top: 6, right: 2, left: 2, bottom: 2 }}>
                  <defs>
                    <linearGradient id="solSparkGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={sparkColor} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={sparkColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={['dataMin', 'dataMax']} hide />
                  <Tooltip
                    cursor={{ stroke: 'rgba(255,255,255,0.16)', strokeWidth: 1 }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload[0]) return null;
                      const pt = payload[0].payload as { label?: string; price?: number };
                      return (
                        <div className="bg-[#0A0B0E] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-[11px] font-mono tabular-nums text-white shadow-lg">
                          <span className="text-zinc-400">{pt.label} · </span>
                          <span className="font-semibold">${Number(pt.price ?? 0).toFixed(2)}</span>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke={sparkColor}
                    strokeWidth={2}
                    fill="url(#solSparkGradient)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full rounded-xl bg-[#0A0B0E]/60 flex items-center justify-center text-xs text-zinc-500">
                Loading 7-day SOL price trend…
              </div>
            )}
          </div>
        </div>

        {/* 2x2 Portfolio Metrics */}
        <div className="lg:col-span-7 grid grid-cols-2 gap-3 sm:gap-4">
          {/* Card 1: Total Net PnL */}
          <div className="bg-[#13151B] border border-white/[0.07] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
              <span>Total Net PnL</span>
              {analysis ? (
                isPositivePnl ? (
                  <span className="inline-flex items-center gap-0.5 text-[#14F195] font-medium">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Gain</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-rose-400 font-medium">
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    <span>Loss</span>
                  </span>
                )
              ) : null}
            </div>
            <div>
              <div
                className={`font-mono tabular-nums text-xl sm:text-2xl font-bold tracking-tight ${
                  !analysis ? 'text-white' : isPositivePnl ? 'text-[#14F195]' : 'text-rose-400'
                }`}
              >
                {analysis && isPositivePnl && pnlUsd > 0 ? `+${formatUsd(pnlUsd)}` : formatUsd(pnlUsd)}
              </div>
              <div className="font-mono tabular-nums text-xs text-zinc-500 mt-1">
                {pnlSol >= 0 ? '+' : ''}
                {pnlSol.toFixed(4)} SOL
              </div>
            </div>
          </div>

          {/* Card 2: Trades Count */}
          <div className="bg-[#13151B] border border-white/[0.07] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
              <span>Trades</span>
              <Layers className="w-3.5 h-3.5 text-zinc-500" />
            </div>
            <div>
              <div className="font-mono tabular-nums text-xl sm:text-2xl font-bold tracking-tight text-white">
                {trades.toLocaleString('en-US')}
              </div>
              <div className="text-xs text-zinc-500 mt-1">Swaps &amp; transfers</div>
            </div>
          </div>

          {/* Card 3: Win Rate */}
          <div className="bg-[#13151B] border border-white/[0.07] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
              <span>Win Rate</span>
              <TrendingUp className="w-3.5 h-3.5 text-zinc-500" />
            </div>
            <div>
              <div className="font-mono tabular-nums text-xl sm:text-2xl font-bold tracking-tight text-white">
                {winRate.toFixed(1)}%
              </div>
              <div className="w-full h-1.5 bg-[#0A0B0E] rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-[#14F195] rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, winRate))}%` }}
                />
              </div>
            </div>
          </div>

          {/* Card 4: Total Gas Fees */}
          <div className="bg-[#13151B] border border-white/[0.07] rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
              <span>Total Gas Fees</span>
              <Fuel className="w-3.5 h-3.5 text-zinc-500" />
            </div>
            <div>
              <div className="font-mono tabular-nums text-xl sm:text-2xl font-bold tracking-tight text-white">
                {formatUsd(gasUsd)}
              </div>
              <div className="font-mono tabular-nums text-xs text-zinc-500 mt-1">
                {gasSol.toFixed(5)} SOL
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Empty Wallet State Notice */}
      {analysis?.isEmpty && (
        <div className="bg-[#13151B] border border-white/[0.07] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-zinc-300">
          <span>
            This wallet has 0 on-chain transactions. Showing $0.00 PnL and 0 trades cleanly — no
            daily scan credit was deducted.
          </span>
          <span className="font-mono tabular-nums text-zinc-400 shrink-0">
            Balance: {analysis.solBalance.toFixed(4)} SOL
          </span>
        </div>
      )}
    </div>
  );
};
