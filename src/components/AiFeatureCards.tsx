import React from 'react';
import { ArrowUpRight, Clock, Flame, Lock, MessageSquare, Radar } from 'lucide-react';
import { isVipSuperEmail } from '../lib/vip';

export type AiFeatureType = 'roast' | 'what-if' | 'whale' | 'coach';

interface AiFeatureCardsProps {
  onSelectFeature: (feature: AiFeatureType) => void;
  onUpgradeRequired: () => void;
  isFreeTier: boolean;
  userEmail?: string;
  hasScannedWallet: boolean;
  tradesCount: number;
}

const FEATURES: Array<{
  id: AiFeatureType;
  title: string;
  description: string;
  actionLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'roast',
    title: 'AI Roast Card',
    description: 'Get an honest, witty 4-line trade roast in English with instant sharing.',
    actionLabel: 'Generate Roast',
    icon: Flame,
  },
  {
    id: 'what-if',
    title: 'What-If Time Machine',
    description: 'Simulate missed profits on tokens sold early or sidelined entries.',
    actionLabel: 'Run Simulation',
    icon: Clock,
  },
  {
    id: 'whale',
    title: 'Copy-Whale Decoder',
    description: "Analyze any top wallet's entry/exit strategy and conviction score.",
    actionLabel: 'Decode Wallet',
    icon: Radar,
  },
  {
    id: 'coach',
    title: 'AI Coach Chat',
    description: "Chat in English with a trading coach aware of your scanned wallet's stats.",
    actionLabel: 'Open Coach',
    icon: MessageSquare,
  },
];

export const AiFeatureCards: React.FC<AiFeatureCardsProps> = ({
  onSelectFeature,
  onUpgradeRequired,
  isFreeTier,
  userEmail,
  hasScannedWallet,
  tradesCount,
}) => {
  const lockedForUser = isFreeTier && !isVipSuperEmail(userEmail);
  return (
    <section aria-labelledby="ai-suite-heading" className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-1">
        <div>
          <h2
            id="ai-suite-heading"
            className="font-display text-lg sm:text-xl font-bold tracking-tight text-white"
          >
            AI Trading Intelligence
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            {lockedForUser
              ? 'Upgrade to Pro or Super to unlock all 4 Gemini AI trading tools.'
              : hasScannedWallet
                ? `Synced to scanned wallet (${tradesCount} trades) · 10-minute response cache active`
                : 'All 4 Gemini AI tools are unlocked — tap any card to run now or scan a wallet first.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {FEATURES.map((feat) => {
          const Icon = feat.icon;
          return (
            <button
              key={feat.id}
              type="button"
              onClick={() => (lockedForUser ? onUpgradeRequired() : onSelectFeature(feat.id))}
              aria-label={
                lockedForUser ? `${feat.title} — Pro plan required to unlock` : feat.title
              }
              className={`group text-left bg-[#13151B] hover:bg-[#171A22] border rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4 min-h-[154px] transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14F195] ${
                lockedForUser
                  ? 'border-white/[0.07] hover:border-white/[0.16]'
                  : 'border-white/[0.07] hover:border-[#14F195]/40'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      lockedForUser
                        ? 'bg-white/[0.05] border border-white/[0.08] text-zinc-400'
                        : 'bg-[#14F195]/10 border border-[#14F195]/20 text-[#14F195]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  {lockedForUser && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.12] text-[11px] font-semibold text-zinc-200 whitespace-nowrap shrink-0">
                      <Lock className="w-3 h-3 text-[#14F195]" />
                      <span>Pro Feature</span>
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="font-display text-base font-semibold text-white">
                    {feat.title}
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed mt-1">{feat.description}</p>
                </div>
              </div>

              <div
                className={`flex items-center justify-between text-xs font-medium pt-1 border-t border-white/[0.05] ${
                  lockedForUser ? 'text-zinc-300 group-hover:text-[#14F195]' : 'text-[#14F195]'
                }`}
              >
                <span>{lockedForUser ? 'Upgrade to Unlock' : feat.actionLabel}</span>
                {lockedForUser ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
