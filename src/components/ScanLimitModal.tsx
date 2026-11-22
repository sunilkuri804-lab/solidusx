import React, { useEffect, useState } from 'react';
import { PlayCircle, Sparkles, X, Zap } from 'lucide-react';

interface ScanLimitModalProps {
  open: boolean;
  onClose: () => void;
  onUpgradeToPro: () => void;
  onClaimRewardedAd: () => Promise<void>;
}

export const ScanLimitModal: React.FC<ScanLimitModalProps> = ({
  open,
  onClose,
  onUpgradeToPro,
  onClaimRewardedAd,
}) => {
  const [adPlaying, setAdPlaying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setAdPlaying(false);
      setSecondsLeft(5);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!adPlaying) return;
    if (secondsLeft <= 0) {
      setClaiming(true);
      onClaimRewardedAd()
        .then(() => {
          setAdPlaying(false);
          setClaiming(false);
          onClose();
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Unable to credit reward scan.');
          setAdPlaying(false);
          setClaiming(false);
        });
      return;
    }
    const timer = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [adPlaying, secondsLeft, onClaimRewardedAd, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-limit-title"
    >
      <div className="bg-[#13151B] border border-white/[0.1] rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 id="scan-limit-title" className="font-display text-lg font-bold text-white">
              Daily Free Scan Limit Reached
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Free accounts include 1 active wallet scan per day. Choose how you would like to
              continue:
            </p>
          </div>
          {!adPlaying && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="min-h-[40px] min-w-[40px] rounded-xl hover:bg-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300">
            {error}
          </div>
        )}

        {adPlaying ? (
          <div className="bg-[#0A0B0E] border border-[#14F195]/30 rounded-2xl p-5 text-center space-y-3">
            <div className="text-xs text-zinc-400">Google AdMob Rewarded Ad Preview</div>
            <div className="font-mono tabular-nums text-3xl font-bold text-[#14F195]">
              {claiming ? 'Unlocking…' : `${secondsLeft}s`}
            </div>
            <p className="text-xs text-zinc-300">
              Your +1 free Solana wallet scan unlocks automatically when the timer finishes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Choice 1: Upgrade to Pro */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onUpgradeToPro();
              }}
              className="w-full min-h-[52px] px-4 py-3 rounded-xl bg-[#14F195] hover:bg-[#11d984] text-[#0A0B0E] font-semibold text-sm flex items-center justify-between gap-3 transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <Zap className="w-4 h-4 fill-[#0A0B0E]" />
                <span>Upgrade to Pro</span>
              </span>
              <span className="font-mono tabular-nums text-xs">$19/mo · 50/day</span>
            </button>

            {/* Choice 2: Watch Short Ad for +1 Free Scan */}
            <button
              type="button"
              onClick={() => {
                setSecondsLeft(5);
                setAdPlaying(true);
              }}
              className="w-full min-h-[52px] px-4 py-3 rounded-xl bg-[#0A0B0E] hover:bg-[#1A1D25] border border-white/[0.1] text-white font-medium text-sm flex items-center justify-between gap-3 transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <PlayCircle className="w-4 h-4 text-[#14F195]" />
                <span>Watch a Short Ad for +1 Free Scan</span>
              </span>
              <span className="text-xs text-zinc-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AdMob</span>
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
