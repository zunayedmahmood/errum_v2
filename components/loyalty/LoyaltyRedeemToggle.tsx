'use client';

import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Loader2, Sparkles } from 'lucide-react';
import loyaltyCardService, { LoyaltyPreview } from '@/services/loyaltyCardService';

interface Props {
  phone?: string | null;
  eligibleAmount: number;
  checked: boolean;
  onChange: (checked: boolean, preview: LoyaltyPreview | null) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

export default function LoyaltyRedeemToggle({
  phone,
  eligibleAmount,
  checked,
  onChange,
  disabled = false,
  compact = false,
  className = '',
}: Props) {
  const [preview, setPreview] = useState<LoyaltyPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const cleanPhone = useMemo(() => String(phone || '').replace(/\D/g, ''), [phone]);
  const safeEligible = Math.max(0, Number(eligibleAmount) || 0);

  useEffect(() => {
    let cancelled = false;

    if (cleanPhone.length < 10 || safeEligible <= 0 || disabled) {
      setPreview(null);
      setFailed(false);
      if (checked) onChange(false, null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const next = await loyaltyCardService.previewCheckout(cleanPhone, safeEligible);
        if (cancelled) return;
        setPreview(next);
        if (!next.can_redeem && checked) onChange(false, next);
        else onChange(checked && next.can_redeem, next);
      } catch {
        if (cancelled) return;
        setPreview(null);
        setFailed(true);
        if (checked) onChange(false, null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // onChange is intentionally excluded so parent callbacks do not restart lookup loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanPhone, safeEligible, disabled]);

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" /> Checking loyalty card…
      </div>
    );
  }

  if (failed || !preview?.has_loyalty_card) return null;

  if (!preview.can_redeem) {
    return compact ? null : (
      <div className={`flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300 ${className}`}>
        <BadgeCheck className="h-4 w-4 text-emerald-500" />
        Loyalty card found · {preview.points_balance.toLocaleString()} points · no whole-taka discount available yet
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked, preview)}
      aria-pressed={checked}
      className={`group flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
        checked
          ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-100 dark:bg-violet-950/40 dark:ring-violet-900/40'
          : 'border-violet-200 bg-white hover:border-violet-400 dark:border-violet-800 dark:bg-gray-900'
      } ${className}`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full ${checked ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300'}`}>
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900 dark:text-white">
            {checked ? 'Loyalty discount applied' : `Use ৳${preview.redeemable_taka.toLocaleString()} loyalty discount`}
          </span>
          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
            {preview.points_to_redeem.toLocaleString()} of {preview.points_balance.toLocaleString()} points · remaining points stay available
          </span>
        </span>
      </span>
      <span className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${checked ? 'bg-violet-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}
