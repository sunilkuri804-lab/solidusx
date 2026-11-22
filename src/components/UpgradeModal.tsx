import React, { useState } from 'react';
import { Check, ShieldCheck, X, Zap } from 'lucide-react';
import type { SubscriptionTier } from '../types';

interface UpgradeModalProps {
  open: boolean;
  currentTier: SubscriptionTier;
  onClose: () => void;
  onSelectTier: (tier: SubscriptionTier) => Promise<void>;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  open,
  currentTier,
  onClose,
  onSelectTier,
}) => {
  const [superBilling, setSuperBilling] = useState<'monthly' | 'annual'>('monthly');
  const [submittingTier, setSubmittingTier] = useState<SubscriptionTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleChoose = async (tier: SubscriptionTier) => {
    if (tier === currentTier) return;
    setError(null);
    setSubmittingTier(tier);
    try {
      await onSelectTier(tier);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update subscription.');
    } finally {
      setSubmittingTier(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
    >
      <div className="bg-[#13151B] border border-white/[0.1] rounded-t-3xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-white/[0.07] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Zap className="w-5 h-5 text-[#14F195] fill-[#14F195]" />
            <div>
              <h2 id="upgrade-modal-title" className="font-display text-lg font-bold text-white">
                SolidusX AI Plans
              </h2>
              <p className="text-xs text-zinc-400">
                USD subscription plans ready for Google Play Billing
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close upgrade modal"
            className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Super Billing Cadence Switch */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-zinc-400">
              All 4 AI tools stay unlocked on every plan. Upgrade for higher scan limits &amp; zero
              ads.
            </span>
            <div className="inline-flex items-center p-1 bg-[#0A0B0E] border border-white/[0.07] rounded-xl">
              <button
                type="button"
                onClick={() => setSuperBilling('monthly')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  superBilling === 'monthly'
                    ? 'bg-[#1D2029] text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setSuperBilling('annual')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  superBilling === 'annual'
                    ? 'bg-[#1D2029] text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Annual Super
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* 3-Tier Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Free */}
            <div className="bg-[#0A0B0E] border border-white/[0.08] rounded-2xl p-5 flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <div className="text-xs text-zinc-400 font-medium">Starter Access</div>
                <div>
                  <div className="font-display text-xl font-bold text-white">Free</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-white mt-1">
                    $0<span className="text-xs font-normal text-zinc-500">/mo</span>
                  </div>
                </div>
                <ul className="space-y-2 text-xs text-zinc-300 pt-2 border-t border-white/[0.06]">
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#14F195] shrink-0 mt-0.5" />
                    <span>1 wallet scan per day</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#14F195] shrink-0 mt-0.5" />
                    <span>All 4 AI tools unlocked</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                    <span>Ad-supported (+1 scan via ad)</span>
                  </li>
                </ul>
              </div>

              <button
                type="button"
                disabled={currentTier === 'Free' || submittingTier !== null}
                onClick={() => handleChoose('Free')}
                className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#1A1D25] hover:bg-[#232732] text-xs font-semibold text-zinc-200 disabled:opacity-50 transition-colors"
              >
                {currentTier === 'Free'
                  ? 'Current Plan'
                  : submittingTier === 'Free'
                    ? 'Updating…'
                    : 'Switch to Free'}
              </button>
            </div>

            {/* Pro */}
            <div className="bg-[#0A0B0E] border border-[#14F195]/50 rounded-2xl p-5 flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <div className="text-xs text-[#14F195] font-medium">Most Popular · Active Traders</div>
                <div>
                  <div className="font-display text-xl font-bold text-white">Pro</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-white mt-1">
                    $19<span className="text-xs font-normal text-zinc-500">/mo</span>
                  </div>
                </div>
                <ul className="space-y-2 text-xs text-zinc-200 pt-2 border-t border-white/[0.06]">
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#14F195] shrink-0 mt-0.5" />
                    <span>50 wallet scans per day</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#14F195] shrink-0 mt-0.5" />
                    <span>100% ad-free experience</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#14F195] shrink-0 mt-0.5" />
                    <span>All 4 Gemini AI tools priority</span>
                  </li>
                </ul>
              </div>

              <button
                type="button"
                disabled={currentTier === 'Pro' || submittingTier !== null}
                onClick={() => handleChoose('Pro')}
                className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#14F195] hover:bg-[#11d984] text-[#0A0B0E] text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {currentTier === 'Pro'
                  ? 'Current Plan'
                  : submittingTier === 'Pro'
                    ? 'Processing…'
                    : 'Subscribe to Pro'}
              </button>
            </div>

            {/* Super */}
            <div className="bg-[#0A0B0E] border border-white/[0.08] rounded-2xl p-5 flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <div className="text-xs text-zinc-400 font-medium">Whale Hunters &amp; Funds</div>
                <div>
                  <div className="font-display text-xl font-bold text-white">Super</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-white mt-1">
                    {superBilling === 'monthly' ? '$89' : '$1,099'}
                    <span className="text-xs font-normal text-zinc-500">
                      {superBilling === 'monthly' ? '/mo' : '/yr'}
                    </span>
                  </div>
                </div>
                <ul className="space-y-2 text-xs text-zinc-300 pt-2 border-t border-white/[0.06]">
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#14F195] shrink-0 mt-0.5" />
                    <span>Unlimited daily wallet scans</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#14F195] shrink-0 mt-0.5" />
                    <span>100% ad-free experience</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-[#14F195] shrink-0 mt-0.5" />
                    <span>Priority Copy-Whale &amp; Coach AI</span>
                  </li>
                </ul>
              </div>

              <button
                type="button"
                disabled={currentTier === 'Super' || submittingTier !== null}
                onClick={() => handleChoose('Super')}
                className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-[#0A0B0E] text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {currentTier === 'Super'
                  ? 'Current Plan'
                  : submittingTier === 'Super'
                    ? 'Processing…'
                    : 'Subscribe to Super'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <ShieldCheck className="w-4 h-4 text-[#14F195] shrink-0" />
            <span>
              Google Play Billing ready. Cancel anytime from Google Play Subscriptions or Settings.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
