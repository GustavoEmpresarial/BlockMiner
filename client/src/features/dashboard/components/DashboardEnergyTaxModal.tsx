import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { Loader2, ShieldAlert, Sparkles, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { api, useAuthStore } from '../../../shared/auth/auth.store';
import { getEnergyTaxSummary, type EnergyTaxSummaryResponse } from '../lib/dashboard.api';
import { logDashboardError } from '../lib/dashboard.errors';
import { TaxPayCurrencyPicker } from '../../taxes/components/TaxPayCurrencyPicker';
import {
  formatTaxPayAmount,
  pickDefaultTaxPayCurrency,
  type TaxPayCurrency,
} from '../../taxes/lib/taxPayCurrency';

type EnergySummary = {
  active: boolean;
  unpaidDays: number;
  todayDailyCharge: number;
  todayPaid: boolean;
  todayExempt: boolean;
  yesterdayRewards: number;
  fullRateTax: number;
  dailyRateTax: number;
  totalRewards7d: number;
  todayPayQuotes?: EnergyTaxSummaryResponse['todayPayQuotes'];
};

function formatPol6(value: number): string {
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })} POL`;
}

export default function DashboardEnergyTaxModal() {
  const { t } = useTranslation();
  const setUser = useAuthStore((s) => s.setUser);
  const checkSession = useAuthStore((s) => s.checkSession);
  const [open, setOpen] = useState(true);
  const [visible, setVisible] = useState(false);
  const [summary, setSummary] = useState<EnergySummary | null>(null);
  const [payCurrency, setPayCurrency] = useState<TaxPayCurrency>('POL');
  const [paying, setPaying] = useState(false);
  const fetchedRef = useRef(false);
  const modalCardRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    getEnergyTaxSummary()
      .then((data) => {
        if (cancelled) return;
        if (data.active !== true) {
          setVisible(false);
          return;
        }
        const unpaidDays = Number(data.unpaidDays) || 0;
        const pending = unpaidDays > 0;
        setVisible(pending);
        if (!pending) return;
        setSummary({
          active: true,
          unpaidDays,
          todayDailyCharge: Number(data.todayDailyCharge) || 0,
          todayPaid: data.todayPaid === true,
          todayExempt: data.todayExempt === true,
          yesterdayRewards: Number(data.yesterdayRewards) || 0,
          fullRateTax: Number(data.fullRateTax) || 0,
          dailyRateTax: Number(data.dailyRateTax) || 0,
          totalRewards7d: Number(data.totalRewards7d) || 0,
          todayPayQuotes: data.todayPayQuotes,
        });
        if (data.todayPayQuotes) {
          setPayCurrency(pickDefaultTaxPayCurrency(data.todayPayQuotes));
        }
      })
      .catch((err: unknown) => {
        logDashboardError('DASHBOARD_ENERGY_TAX_FETCH_FAILED', err);
        if (!cancelled) setVisible(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Lock body scroll and capture previous focus while open
  useEffect(() => {
    if (!visible || !open) return;

    if (typeof document !== 'undefined') {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      const originalOverflow = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }

      // Move focus into the modal
      if (modalCardRef.current) {
        modalCardRef.current.focus();
      }

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
        if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
          previousActiveElementRef.current.focus();
        }
      };
    }
  }, [visible, open]);

  // Handle ESC key press to close modal
  useEffect(() => {
    if (!visible || !open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, open]);

  if (!visible || !open) return null;

  const quote = summary?.todayPayQuotes?.[payCurrency];
  const canPay =
    !!summary &&
    !summary.todayPaid &&
    (summary.todayExempt || summary.yesterdayRewards > 0) &&
    (summary.todayExempt || quote?.affordable !== false);

  const payLabel = summary?.todayExempt
    ? t('dashboard.energy_register_exempt')
    : quote
      ? t('dashboard.energy_pay_now', { amount: formatTaxPayAmount(quote.amount, payCurrency) })
      : t('dashboard.energy_pay_now', { amount: formatPol6(summary?.todayDailyCharge ?? 0) });

  async function payDaily() {
    if (!canPay || paying) return;
    setPaying(true);
    try {
      await api.post('/energy-tax/pay-daily', { currency: payCurrency });
      toast.success(t('taxes.energy_tax.toast_paid_success'));
      if (typeof setUser === 'function') {
        setUser({ energyHasPendingTax: false });
      }
      setOpen(false);
      setVisible(false);
      if (typeof checkSession === 'function') {
        await checkSession({ silent: true });
      }
    } catch (err: unknown) {
      logDashboardError('DASHBOARD_ENERGY_TAX_PAY_FAILED', err);
      const message = isAxiosError(err)
        ? (err.response?.data as { message?: string } | undefined)?.message
        : undefined;
      toast.error(message || t('taxes.energy_tax.toast_pay_error_default'));
    } finally {
      setPaying(false);
    }
  }

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="energy-tax-modal-title"
      aria-describedby="energy-tax-modal-description"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto overscroll-contain animate-in fade-in duration-200"
      onClick={() => setOpen(false)}
      data-testid="energy-tax-modal-backdrop"
    >
      {/* Full-viewport backdrop with blur and darkened overlay */}
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md pointer-events-none" />

      {/* Tactile neo-brutalist popup card inspired by MiningHash & BlockMiner aesthetic */}
      <div
        ref={modalCardRef}
        tabIndex={-1}
        className="relative z-10 w-full max-w-lg rounded-t-3xl sm:rounded-3xl border-2 border-amber-500/40 bg-[#0d111d] text-white shadow-[0_0_35px_rgba(245,158,11,0.2),8px_8px_0px_#000000] flex flex-col gap-3 sm:gap-4 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:p-6 max-h-[min(92dvh,92vh)] overflow-y-auto outline-none transition-all my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-gray-700/80 bg-black/60 text-gray-400 hover:text-white hover:border-gray-500 hover:bg-black/90 transition-all shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          aria-label={t('dashboard.energy_close_aria')}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header with neon glow badge & title */}
        <div className="flex items-start gap-3.5 pr-10">
          <div className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-2xl flex items-center justify-center bg-amber-500/15 border-2 border-amber-500/50 shadow-[3px_3px_0px_#000000]">
            <Zap className="w-6 h-6 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 id="energy-tax-modal-title" className="text-base sm:text-lg font-black text-amber-400 tracking-wide leading-snug">
                {t('dashboard.energy_pending_title')}
              </h2>
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                <Sparkles className="w-2.5 h-2.5" />
                {summary?.unpaidDays ?? 1}d
              </span>
            </div>
            <p id="energy-tax-modal-description" className="text-xs text-slate-300 mt-1 leading-relaxed">
              {t('dashboard.energy_pending_sub')}
            </p>
          </div>
        </div>

        {/* Pricing comparison cards */}
        <div className="grid gap-2.5 text-sm">
          {/* Daily Option (Recommended) */}
          <div className="relative rounded-2xl border-2 border-amber-500/50 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent p-3 sm:p-3.5 shadow-[4px_4px_0px_#000000] flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-white font-bold text-sm sm:text-base flex items-center gap-1.5">
                  {t('dashboard.energy_pay_today')}
                </p>
                <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  -66%
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-amber-300/80 leading-snug mt-0.5">
                {t('dashboard.energy_daily_formula')}
              </p>
            </div>
            <div className="text-left sm:text-right shrink-0">
              <span className="font-mono font-extrabold text-amber-400 text-base sm:text-lg tracking-tight block drop-shadow-[0_0_6px_rgba(251,191,36,0.3)]">
                {summary ? formatTaxPayAmount(quote?.amount ?? summary.todayDailyCharge, payCurrency) : '…'}
              </span>
            </div>
          </div>

          {/* Full Week Option */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 sm:p-3.5 shadow-[2px_2px_0px_#000000] flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <div className="min-w-0">
              <p className="text-slate-300 font-semibold text-xs sm:text-sm">
                {t('dashboard.energy_close_week')}
              </p>
              <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                {t('dashboard.energy_weekly_note')}
              </p>
            </div>
            <span className="font-mono font-semibold text-slate-400 text-xs sm:text-sm shrink-0 sm:text-right">
              {summary ? formatPol6(summary.fullRateTax) : '…'}
            </span>
          </div>

          {/* 7-Day Rewards Stat */}
          {summary ? (
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2 flex items-center justify-between text-xs text-slate-400">
              <span>{t('dashboard.energy_mined_7d')}</span>
              <span className="font-mono font-medium text-slate-300">{formatPol6(summary.totalRewards7d)}</span>
            </div>
          ) : null}
        </div>

        {/* Currency Picker */}
        {summary && !summary.todayPaid && summary.yesterdayRewards > 0 && !summary.todayExempt ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3 shadow-[2px_2px_0px_#000000]">
            <TaxPayCurrencyPicker
              selected={payCurrency}
              quotes={summary.todayPayQuotes}
              onChange={setPayCurrency}
              disabled={paying}
              label={t('taxes.pay_currency_label')}
            />
          </div>
        ) : null}

        {/* Exemption Hint (10 activities) */}
        <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-950/30 p-3 flex items-start gap-2.5 text-xs shadow-[3px_3px_0px_#000000]">
          <ShieldAlert className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0 drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
          <p className="text-[11px] sm:text-xs text-emerald-200/90 leading-relaxed min-w-0">
            {t('dashboard.energy_exempt_hint')}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-1">
          {summary?.todayPaid ? (
            <p className="text-center text-xs font-semibold text-emerald-400 py-1.5">
              {t('dashboard.energy_today_already_paid')}
            </p>
          ) : canPay ? (
            <button
              type="button"
              onClick={() => void payDaily()}
              disabled={paying}
              className="w-full text-center text-sm font-black uppercase tracking-wider py-3.5 rounded-xl border-2 border-black bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-black shadow-[4px_4px_0px_#000000] hover:shadow-[5px_5px_0px_#000000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {payLabel}
            </button>
          ) : summary && !summary.todayExempt && quote && !quote.affordable ? (
            <div className="text-center rounded-xl border border-red-500/30 bg-red-950/30 py-2.5 px-3">
              <p className="text-xs font-semibold text-red-300">
                {t('taxes.pay_insufficient', { currency: payCurrency })}
              </p>
            </div>
          ) : null}

          <Link
            to="/taxes"
            onClick={() => setOpen(false)}
            className="w-full text-center text-xs sm:text-sm font-bold py-2.5 sm:py-3 rounded-xl border-2 border-amber-500/30 bg-slate-900/60 hover:bg-amber-500/10 text-amber-300 shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
          >
            {t('dashboard.energy_go_taxes')}
          </Link>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full text-center text-xs font-medium text-slate-400 hover:text-slate-200 py-1 transition-colors"
          >
            {t('dashboard.energy_remind_later')}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
