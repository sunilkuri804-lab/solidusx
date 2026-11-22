import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={
          compact
            ? 'min-h-[38px] px-3 py-1.5 rounded-xl bg-[#1A1D25] hover:bg-[#232732] border border-[#14F195]/30 text-xs font-medium text-[#14F195] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors'
            : 'min-h-[44px] px-4 py-2 rounded-xl bg-[#14F195] hover:bg-[#11d984] text-[#0A0B0E] text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors'
        }
      >
        <Download className="w-4 h-4" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            compact
              ? 'min-h-[38px] px-3 py-1.5 rounded-xl bg-[#1A1D25] hover:bg-[#232732] border border-white/[0.1] text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors'
              : 'min-h-[44px] px-4 py-2 rounded-xl bg-[#1A1D25] hover:bg-[#232732] border border-white/[0.1] text-sm font-medium text-white inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors'
          }
        >
          <Share className="w-4 h-4 text-[#14F195]" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="bg-[#13151B] border border-white/[0.1] rounded-2xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h3 id="ios-install-title" className="font-display text-lg font-bold text-white">
                  Install SolidusX AI on iOS
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="min-h-[40px] min-w-[40px] rounded-xl hover:bg-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="space-y-2 text-xs text-zinc-300 leading-relaxed list-decimal list-inside">
                <li>Tap the Share icon in the Safari toolbar.</li>
                <li>Scroll down and tap Add to Home Screen.</li>
                <li>Tap Add to launch SolidusX AI in full-screen standalone mode.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-xl bg-[#14F195] text-[#0A0B0E] text-sm font-semibold"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
