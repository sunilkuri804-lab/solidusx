import React from 'react';
import { Zap } from 'lucide-react';
import { isVipSuperEmail } from '../lib/vip';
import type { UserProfile } from '../types';

export type AppTab = 'analyzer' | 'ai-suite' | 'settings';

interface HeaderProps {
  profile: UserProfile;
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onOpenUpgrade: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  profile,
  activeTab,
  onSelectTab,
  onOpenUpgrade,
}) => {
  const isVip = isVipSuperEmail(profile.email);
  const effectiveTier = isVip ? 'Super' : profile.tier;
  const remainingLabel =
    isVip || profile.dailyLimit === null
      ? 'Unlimited'
      : `${Math.max(0, profile.dailyLimit - profile.dailyChecks) + profile.bonusChecks} left`;

  return (
    <header className="sticky top-0 z-30 h-14 bg-[#0A0B0E]/92 backdrop-blur-md border-b border-white/[0.06]">
      <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('analyzer')}
          className="flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14F195] rounded-lg"
        >
          <span className="w-7 h-7 rounded-lg bg-[#14F195]/15 border border-[#14F195]/30 flex items-center justify-center text-[#14F195]">
            <Zap className="w-4 h-4 fill-[#14F195]" />
          </span>
          <span className="font-display text-base sm:text-lg font-bold tracking-tight text-white">
            SolidusX AI
          </span>
        </button>

        {/* Zone 2: Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          {(
            [
              { id: 'analyzer', label: 'Analyzer' },
              { id: 'ai-suite', label: 'AI Suite' },
              { id: 'settings', label: 'Settings' },
            ] as const
          ).map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                  active
                    ? 'text-white border-[#14F195]'
                    : 'text-zinc-400 border-transparent hover:text-zinc-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Plan Indicator & Upgrade CTA */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
          <div className="flex items-center gap-1.5 text-xs whitespace-nowrap shrink-0">
            <span
              className={`font-semibold ${
                effectiveTier === 'Super'
                  ? 'text-[#14F195]'
                  : effectiveTier === 'Pro'
                    ? 'text-emerald-300'
                    : 'text-zinc-300'
              }`}
            >
              {effectiveTier}
            </span>
            <span className="text-zinc-600 hidden xs:inline" aria-hidden="true">
              ·
            </span>
            <span className="font-mono tabular-nums text-zinc-400 hidden sm:inline">
              {remainingLabel}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenUpgrade}
            className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#14F195] hover:bg-[#11d984] active:scale-[0.98] text-[#0A0B0E] text-xs font-semibold whitespace-nowrap shrink-0 transition-all"
          >
            {effectiveTier === 'Super' ? 'Manage Plan' : 'Upgrade'}
          </button>
        </div>
      </div>
    </header>
  );
};
