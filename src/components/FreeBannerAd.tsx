import React from 'react';
import { Megaphone, ArrowUpRight } from 'lucide-react';
import type { UserProfile } from '../types';

interface FreeBannerAdProps {
  profile: UserProfile;
  onOpenUpgrade: () => void;
}

export const FreeBannerAd: React.FC<FreeBannerAdProps> = ({ profile, onOpenUpgrade }) => {
  // Completely hide all ads for Pro and Super users
  if (profile.tier !== 'Free') {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Sponsored placement"
      className="bg-[#13151B] border border-white/[0.08] rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-[#0A0B0E] border border-white/[0.07] flex items-center justify-center text-zinc-400 shrink-0">
          <Megaphone className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-zinc-500">Sponsored · AdMob Banner Slot</div>
          <div className="text-xs sm:text-sm font-medium text-zinc-200 truncate">
            Remove all ads &amp; unlock 50 daily wallet scans with SolidusX Pro
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenUpgrade}
        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#1A1D25] hover:bg-[#232732] border border-white/[0.08] text-xs font-medium text-[#14F195] inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
      >
        <span>Go Ad-Free</span>
        <ArrowUpRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
