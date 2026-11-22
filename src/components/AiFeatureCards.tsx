import React from 'react';
import { ArrowUpRight, Clock, Flame, MessageSquare, Radar } from 'lucide-react';

export type AiFeatureType = 'roast' | 'what-if' | 'whale' | 'coach';

interface AiFeatureCardsProps {
  onSelectFeature: (feature: AiFeatureType) => void;
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
  hasScannedWallet,
  tradesCount,
}) => {
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
            {hasScannedWallet
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
              onClick={() => onSelectFeature(feat.id)}
              className="group text-left bg-[#13151B] hover:bg-[#171A22] border border-white/[0.07] hover:border-[#14F195]/40 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4 min-h-[154px] transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14F195]"
            >
              <div className="space-y-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#14F195]/10 border border-[#14F195]/20 flex items-center justify-center text-[#14F195]">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-white">
                    {feat.title}
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed mt-1">{feat.description}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-medium text-[#14F195] pt-1 border-t border-white/[0.05]">
                <span>{feat.actionLabel}</span>
                <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
