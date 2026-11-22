import React from 'react';
import { ArrowDownRight, ArrowUpRight, TrendingUp } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import type { SolPriceHistory } from '../types';

interface SolPriceSparklineCardProps {
  solHistory: SolPriceHistory | null;
  liveSpotPrice?: number;
}

export const SolPriceSparklineCard: React.FC<SolPriceSparklineCardProps> = ({
  solHistory,
  liveSpotPrice,
}) => {
  const currentPrice = liveSpotPrice && liveSpotPrice > 0 ? liveSpotPrice : solHistory?.currentPriceUsd ?? 0;
  const change7d = solHistory?.change7dPct ?? 0;
  const isPositive = change7d >= 0;
  const points = solHistory?.points ?? [];
  const sparkColor = '#14F195';

  return (
    <section
      aria-label="7-day Solana price history"
      className="bg-[#13151B] border border-white/[0.07] rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-3 h-full"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <TrendingUp className="w-3.5 h-3.5 text-[#14F195]" />
            <span>Solana (SOL) · 7D</span>
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold tracking-tight text-white mt-1">
            {currentPrice > 0 ? `$${currentPrice.toFixed(2)}` : '—'}
          </div>
        </div>

        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#14F195]/12 border border-[#14F195]/30 text-[#14F195] font-mono tabular-nums text-xs font-semibold whitespace-nowrap shrink-0">
          {isPositive ? (
            <ArrowUpRight className="w-3.5 h-3.5" />
          ) : (
            <ArrowDownRight className="w-3.5 h-3.5" />
          )}
          <span>
            {isPositive ? '+' : ''}
            {change7d.toFixed(1)}%
          </span>
        </span>
      </div>

      <div className="w-full h-[92px]" aria-label="7-day SOL price sparkline chart">
        {points.length > 0 ? (
          <ResponsiveContainer width="100%" height={92}>
            <AreaChart data={points} margin={{ top: 6, right: 2, left: 2, bottom: 2 }}>
              <defs>
                <linearGradient id="solSparkEmeraldGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparkColor} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={sparkColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis domain={['dataMin', 'dataMax']} hide />
              <Tooltip
                cursor={{ stroke: 'rgba(20,241,149,0.28)', strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload[0]) return null;
                  const pt = payload[0].payload as { label?: string; price?: number };
                  return (
                    <div className="bg-[#0A0B0E] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-[11px] font-mono tabular-nums text-white shadow-lg">
                      <span className="text-zinc-400">{pt.label} · </span>
                      <span className="font-semibold text-[#14F195]">
                        ${Number(pt.price ?? 0).toFixed(2)}
                      </span>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={sparkColor}
                strokeWidth={2}
                fill="url(#solSparkEmeraldGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full rounded-xl bg-[#0A0B0E]/60 flex items-center justify-center text-xs text-zinc-500">
            Loading 7D SOL chart…
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>7-day spot trend (USD)</span>
        <span className="font-mono">
          {solHistory?.source === 'coingecko'
            ? 'CoinGecko'
            : solHistory?.source === 'kraken'
              ? 'Kraken'
              : 'Live Sync'}
        </span>
      </div>
    </section>
  );
};
