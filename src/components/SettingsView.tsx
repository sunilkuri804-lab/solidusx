import React, { useState } from 'react';
import { AlertTriangle, Check, LogOut, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { isVipSuperEmail } from '../lib/vip';
import type { UserProfile } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  profile: UserProfile;
  onOpenUpgrade: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  onOpenUpgrade,
  onSignOut,
  onDeleteAccount,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isVip = isVipSuperEmail(profile.email);
  const effectiveTier = isVip ? 'Super' : profile.tier;

  const handleConfirmDelete = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await onDeleteAccount();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unable to delete account right now.');
      setDeleting(false);
    }
  };

  const quotaText =
    isVip || profile.dailyLimit === null
      ? 'Unlimited daily scans'
      : `${profile.dailyChecks} / ${profile.dailyLimit} daily scans used${
          profile.bonusChecks > 0 ? ` (+${profile.bonusChecks} ad bonus)` : ''
        }`;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h2 className="font-display text-2xl font-bold text-white tracking-tight">
          Account &amp; Settings
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Manage your subscription tier, scan quota, and account privacy controls.
        </p>
      </div>

      {/* Account Summary */}
      <div className="bg-[#13151B] border border-white/[0.07] rounded-2xl divide-y divide-white/[0.06]">
        <div className="p-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-zinc-400">Signed-in Email</div>
            <div className="text-sm sm:text-base font-medium text-white truncate mt-0.5">
              {profile.email}
            </div>
          </div>
          <span className="text-xs text-zinc-400 whitespace-nowrap shrink-0">
            Language: English
          </span>
        </div>

        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs text-zinc-400">Active Subscription</div>
            <div className="flex items-center gap-2 mt-1">
              <Zap className="w-4 h-4 text-[#14F195]" />
              <span className="font-display text-base font-semibold text-white">
                {effectiveTier} Plan
              </span>
              <span className="text-xs text-zinc-500" aria-hidden="true">
                ·
              </span>
              <span className="font-mono tabular-nums text-xs text-zinc-300">{quotaText}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenUpgrade}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#14F195] hover:bg-[#11d984] text-[#0A0B0E] text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
          >
            {effectiveTier === 'Super' ? 'View Plans' : 'Upgrade Plan'}
          </button>
        </div>

        <div className="p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 text-[#14F195] shrink-0" />
            <div className="text-xs text-zinc-300 leading-relaxed">
              Read-only wallet inspection. SolidusX AI never requests seed phrases, private keys, or
              signing permissions.
            </div>
          </div>
          {effectiveTier !== 'Free' && (
            <span className="inline-flex items-center gap-1 text-xs text-[#14F195] whitespace-nowrap shrink-0">
              <Check className="w-3.5 h-3.5" />
              <span>Ad-Free</span>
            </span>
          )}
        </div>

        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Install SolidusX AI App</div>
            <div className="text-xs text-zinc-400 mt-0.5">
              Add to your home screen for standalone full-screen launch and offline shell caching.
            </div>
          </div>
          <PWAInstallButton />
        </div>
      </div>

      {/* Session & Compliance Actions */}
      <div className="bg-[#13151B] border border-white/[0.07] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Sign Out</div>
            <div className="text-xs text-zinc-400 mt-0.5">
              End your active session on this device.
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1A1D25] hover:bg-[#232732] border border-white/[0.08] text-sm font-medium text-white inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="h-px bg-white/[0.06]" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-rose-400">Delete Account</div>
            <div className="text-xs text-zinc-400 mt-0.5">
              Permanently erase your account profile and usage history.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-sm font-medium text-rose-300 inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Account</span>
          </button>
        </div>
      </div>

      {/* Account Deletion Confirmation Dialog */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div className="bg-[#13151B] border border-white/[0.1] rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 id="delete-account-title" className="font-display text-lg font-bold text-white">
                  Permanently delete account?
                </h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  This removes your SolidusX AI profile ({profile.email}), subscription state, and
                  daily scan history immediately. This action cannot be undone.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1A1D25] hover:bg-[#232732] text-sm font-medium text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-sm font-semibold text-white transition-colors disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
