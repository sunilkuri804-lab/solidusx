import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Lock,
  QrCode,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';
import { fetchSolanaPaymentQuote, verifySolanaPayment } from '../lib/api';
import type { SolanaPaymentQuote, SubscriptionTier, UserProfile } from '../types';

const MERCHANT_WALLET = '9XEcqn4CfftDGx3DJLdHgPc7KoF9YPUgeQvHaBztCEt2';

interface UpgradeModalProps {
  open: boolean;
  token: string;
  currentTier: SubscriptionTier;
  onClose: () => void;
  onSelectFreeTier: () => Promise<void>;
  onPaymentActivated: (profile: UserProfile) => void;
}

interface SelectedCheckoutPlan {
  tier: 'Pro' | 'Super';
  billing: 'monthly' | 'annual';
  usd: number;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  open,
  token,
  currentTier,
  onClose,
  onSelectFreeTier,
  onPaymentActivated,
}) => {
  const [superBilling, setSuperBilling] = useState<'monthly' | 'annual'>('monthly');
  const [checkoutPlan, setCheckoutPlan] = useState<SelectedCheckoutPlan | null>(null);
  const [quote, setQuote] = useState<SolanaPaymentQuote | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [txSignature, setTxSignature] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [switchingFree, setSwitchingFree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Fetch live SOL quote when modal opens
  useEffect(() => {
    if (!open) {
      setCheckoutPlan(null);
      setTxSignature('');
      setError(null);
      setSuccessMsg(null);
      setCopiedAddress(false);
      return;
    }

    let active = true;
    fetchSolanaPaymentQuote(token)
      .then((q) => {
        if (active) setQuote(q);
      })
      .catch(() => {
        // Fallback quote if offline
      });
    return () => {
      active = false;
    };
  }, [open, token]);

  const merchantAddress = quote?.merchantWallet || MERCHANT_WALLET;
  const requiredSolAmount = (() => {
    if (!checkoutPlan) return 0;
    if (quote) {
      if (checkoutPlan.tier === 'Pro') return quote.quotes.Pro.monthly.sol;
      return checkoutPlan.billing === 'annual'
        ? quote.quotes.Super.annual.sol
        : quote.quotes.Super.monthly.sol;
    }
    const fallbackSpot = 185;
    return Math.ceil((checkoutPlan.usd / fallbackSpot) * 10000) / 10000;
  })();

  // Generate QR code locally when entering Solana payment view
  useEffect(() => {
    if (!open || !checkoutPlan) return;
    const solanaPayUri = `solana:${merchantAddress}?amount=${requiredSolAmount}&label=${encodeURIComponent(
      'SolidusX AI'
    )}&message=${encodeURIComponent(
      `SolidusX ${checkoutPlan.tier} (${checkoutPlan.billing === 'annual' ? '$1,099/yr' : `$${checkoutPlan.usd}/mo`})`
    )}`;

    let active = true;
    QRCode.toDataURL(solanaPayUri, {
      width: 220,
      margin: 2,
      color: {
        dark: '#0A0B0E',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [open, checkoutPlan, merchantAddress, requiredSolAmount]);

  if (!open) return null;

  const handleOpenSolanaPayment = (tier: 'Pro' | 'Super') => {
    setError(null);
    setSuccessMsg(null);
    setTxSignature('');
    const billing: 'monthly' | 'annual' = tier === 'Super' ? superBilling : 'monthly';
    const usd = tier === 'Pro' ? 19 : billing === 'annual' ? 1099 : 89;
    setCheckoutPlan({ tier, billing, usd });
  };

  const handleDowngradeToFree = async () => {
    if (currentTier === 'Free') return;
    setError(null);
    setSwitchingFree(true);
    try {
      await onSelectFreeTier();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to switch plan.');
    } finally {
      setSwitchingFree(false);
    }
  };

  const handleCopyWallet = async () => {
    try {
      await navigator.clipboard.writeText(merchantAddress);
      setCopiedAddress(true);
      window.setTimeout(() => setCopiedAddress(false), 2000);
    } catch {
      setError('Clipboard access unavailable. Please copy the wallet address manually.');
    }
  };

  const handleVerifyPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutPlan) return;
    const cleanedSig = txSignature.trim();
    if (!cleanedSig) {
      setError('Please paste your Solana Transaction Signature (Tx Hash).');
      return;
    }

    setError(null);
    setSuccessMsg(null);
    setVerifying(true);
    try {
      const res = await verifySolanaPayment(token, {
        signature: cleanedSig,
        tier: checkoutPlan.tier,
        billing: checkoutPlan.billing,
      });

      onPaymentActivated(res.profile);
      setSuccessMsg(
        `Verified on Helius RPC! Your ${checkoutPlan.tier} plan is now active and all 4 AI tools are unlocked.`
      );
      window.setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not verify transaction on Helius RPC. Please check your Tx Hash.'
      );
    } finally {
      setVerifying(false);
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
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-white/[0.07] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            {checkoutPlan ? (
              <button
                type="button"
                onClick={() => {
                  setCheckoutPlan(null);
                  setError(null);
                  setSuccessMsg(null);
                }}
                aria-label="Back to plans"
                className="min-h-[40px] min-w-[40px] -ml-1 rounded-xl hover:bg-white/[0.06] flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <Zap className="w-5 h-5 text-[#14F195] fill-[#14F195]" />
            )}
            <div>
              <h2 id="upgrade-modal-title" className="font-display text-lg font-bold text-white">
                {checkoutPlan
                  ? `Direct Solana Payment — ${checkoutPlan.tier}`
                  : 'SolidusX AI Plans'}
              </h2>
              <p className="text-xs text-zinc-400">
                {checkoutPlan
                  ? 'Send SOL or USDC on Solana Mainnet and verify instantly via Helius RPC'
                  : 'Upgrade to Pro or Super with direct Solana payment'}
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

        {/* Body */}
        {checkoutPlan ? (
          <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              {/* QR Code Card */}
              <div className="md:col-span-5 bg-[#0A0B0E] border border-white/[0.08] rounded-2xl p-5 flex flex-col items-center text-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#14F195]">
                  <QrCode className="w-4 h-4" />
                  <span>Scan with Phantom / Solflare</span>
                </div>

                {qrDataUrl ? (
                  <div className="bg-white p-2.5 rounded-xl">
                    <img
                      src={qrDataUrl}
                      alt="Solana Pay QR Code for merchant wallet"
                      className="w-44 h-44 block"
                    />
                  </div>
                ) : (
                  <div className="w-48 h-48 rounded-xl bg-[#13151B] flex items-center justify-center text-xs text-zinc-500">
                    Generating QR…
                  </div>
                )}

                <div className="space-y-0.5">
                  <div className="font-mono tabular-nums text-lg font-bold text-white">
                    {requiredSolAmount} SOL
                  </div>
                  <div className="text-xs text-zinc-400">
                    or ${checkoutPlan.usd.toLocaleString('en-US')} USDC ·{' '}
                    {checkoutPlan.billing === 'annual' ? 'Annual Plan' : 'Monthly Plan'}
                  </div>
                </div>
              </div>

              {/* Merchant Address + Tx Verification Form */}
              <div className="md:col-span-7 space-y-4">
                <div className="bg-[#0A0B0E] border border-white/[0.08] rounded-2xl p-4 space-y-2">
                  <div className="text-xs text-zinc-400 font-medium">
                    Merchant Solana Wallet Address
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-xs text-white bg-[#13151B] border border-white/[0.06] rounded-xl px-3 py-2.5 break-all select-all">
                      {merchantAddress}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyWallet}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#1A1D25] hover:bg-[#232732] border border-white/[0.1] text-xs font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      {copiedAddress ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#14F195]" />
                          <span className="text-[#14F195]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <form onSubmit={handleVerifyPayment} className="space-y-3">
                  <div>
                    <label
                      htmlFor="solana-tx-signature"
                      className="block text-xs font-medium text-zinc-300 mb-1.5"
                    >
                      Solana Transaction Signature (Tx Hash)
                    </label>
                    <input
                      id="solana-tx-signature"
                      type="text"
                      value={txSignature}
                      onChange={(e) => setTxSignature(e.target.value)}
                      placeholder="Paste confirmed Solana transaction signature…"
                      aria-label="Solana Transaction Signature (Tx Hash)"
                      className="w-full min-h-[46px] px-3.5 bg-[#0A0B0E] border border-white/[0.1] focus:border-[#14F195] focus:outline-none rounded-xl font-mono text-xs text-white placeholder:text-zinc-600 transition-colors"
                    />
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 leading-relaxed">
                      {error}
                    </div>
                  )}

                  {successMsg && (
                    <div className="p-3 rounded-xl bg-[#14F195]/10 border border-[#14F195]/30 text-xs text-[#14F195] flex items-start gap-2 leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{successMsg}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={verifying || Boolean(successMsg)}
                    className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#14F195] hover:bg-[#11d984] text-[#0A0B0E] text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{verifying ? 'Verifying on Helius RPC…' : 'Verify & Activate Plan'}</span>
                  </button>
                </form>

                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Transactions are verified directly against Helius Solana Mainnet RPC before
                  activating your tier in your account profile. Each transaction signature can only
                  be redeemed once.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
            {/* Super Billing Cadence Switch */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs text-zinc-400">
                Upgrade to Pro or Super to unlock all 4 AI tools, higher scan limits &amp; zero
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
                      <span>1 free wallet scan per day</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                      <span>Up to 2 extra ad scans (max 3/day)</span>
                    </li>
                    <li className="flex items-start gap-2 text-zinc-400">
                      <Lock className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                      <span>All 4 AI tools locked</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  disabled={currentTier === 'Free' || switchingFree}
                  onClick={handleDowngradeToFree}
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#1A1D25] hover:bg-[#232732] text-xs font-semibold text-zinc-200 disabled:opacity-50 transition-colors"
                >
                  {currentTier === 'Free'
                    ? 'Current Plan'
                    : switchingFree
                      ? 'Updating…'
                      : 'Switch to Free'}
                </button>
              </div>

              {/* Pro */}
              <div className="bg-[#0A0B0E] border border-[#14F195]/50 rounded-2xl p-5 flex flex-col justify-between gap-5">
                <div className="space-y-3">
                  <div className="text-xs text-[#14F195] font-medium">
                    Most Popular · Active Traders
                  </div>
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
                      <span>All 4 AI tools unlocked</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  disabled={currentTier === 'Pro'}
                  onClick={() => handleOpenSolanaPayment('Pro')}
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#14F195] hover:bg-[#11d984] text-[#0A0B0E] text-xs font-semibold disabled:opacity-50 transition-colors"
                >
                  {currentTier === 'Pro' ? 'Current Plan' : 'Subscribe to Pro ($19/mo)'}
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
                      <span>All 4 AI tools unlocked</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  disabled={currentTier === 'Super'}
                  onClick={() => handleOpenSolanaPayment('Super')}
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-[#0A0B0E] text-xs font-semibold disabled:opacity-50 transition-colors"
                >
                  {currentTier === 'Super'
                    ? 'Current Plan'
                    : superBilling === 'monthly'
                      ? 'Subscribe to Super ($89/mo)'
                      : 'Subscribe to Super ($1,099/yr)'}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <ShieldCheck className="w-4 h-4 text-[#14F195] shrink-0" />
              <span>
                Instant SOL / USDC activation verified directly on Solana Mainnet via Helius RPC.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
