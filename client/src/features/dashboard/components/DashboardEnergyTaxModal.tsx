import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { Loader2, ShieldAlert, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { api, useAuthStore } from '../../../shared/auth/auth.store';
import { getEnergyTaxSummary, type EnergyTaxSummaryResponse } from '../lib/dashboard.api';
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
      .catch(() => {
        if (!cancelled) setVisible(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      setUser({ energyHasPendingTax: false });
      setOpen(false);
      setVisible(false);
      await checkSession({ silent: true });
    } catch (err: unknown) {
      const message = isAxiosError(err)
        ? (err.response?.data as { message?: string } | undefined)?.message
        : undefined;
      toast.error(message || t('taxes.energy_tax.toast_pay_error_default'));
    } finally {
      setPaying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => setOpen(false)}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg rounded-t-2xl sm:rounded-2xl border shadow-2xl flex flex-col gap-3 sm:gap-5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 sm:p-8 bg-[#111008] border-yellow-500/30 max-h-[min(92dvh,92vh)] overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 p-2 text-gray-500 hover:text-gray-300 transition-colors"
          aria-label={t('dashboard.energy_close_aria')}
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3 pr-10">
          <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-xl flex items-center justify-center bg-yellow-500/15 border border-yellow-500/30">
            <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm sm:text-base font-bold text-yellow-300 leading-snug">
              {t('dashboard.energy_pending_title')}
            </p>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">{t('dashboard.energy_pending_sub')}</p>
          </div>
        </div>
        <div className="rounded-xl border divide-y text-sm border-yellow-500/20 divide-yellow-500/10 bg-yellow-500/5">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center px-3 sm:px-4 py-3 gap-1.5 sm:gap-3">
            <div className="min-w-0">
              <p className="text-white font-medium text-sm sm:text-base">{t('dashboard.energy_pay_today')}</p>
              <p className="text-[11px] sm:text-xs text-gray-400 leading-snug">{t('dashboard.energy_daily_formula')}</p>
            </div>
            <span className="font-mono font-semibold text-yellow-300 text-sm sm:text-base sm:shrink-0 sm:text-right">
              {summary ? formatTaxPayAmount(quote?.amount ?? summary.todayDailyCharge, payCurrency) : '…'}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center px-3 sm:px-4 py-3 gap-1.5 sm:gap-3">
            <div className="min-w-0">
              <p className="text-white font-medium text-sm sm:text-base">{t('dashboard.energy_close_week')}</p>
              <p className="text-[11px] sm:text-xs text-gray-400 leading-snug">{t('dashboard.energy_weekly_note')}</p>
            </div>
            <span className="font-mono font-semibold text-gray-300 text-sm sm:text-base sm:shrink-0 sm:text-right">
              {summary ? formatPol6(summary.fullRateTax) : '…'}
            </span>
          </div>
          {summary ? (
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center px-3 sm:px-4 py-3 text-xs text-gray-500 gap-1 sm:gap-3">
              <span>{t('dashboard.energy_mined_7d')}</span>
              <span className="font-mono sm:shrink-0">{formatPol6(summary.totalRewards7d)}</span>
            </div>
          ) : null}
        </div>
        {summary && !summary.todayPaid && summary.yesterdayRewards > 0 && !summary.todayExempt ? (
          <TaxPayCurrencyPicker
            selected={payCurrency}
            quotes={summary.todayPayQuotes}
            onChange={setPayCurrency}
            disabled={paying}
            label={t('taxes.pay_currency_label')}
          />
        ) : null}
        <div className="rounded-xl border px-3 sm:px-4 py-3 flex items-start gap-2.5 sm:gap-3 text-sm border-emerald-500/20 bg-emerald-500/5">
          <ShieldAlert className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-[11px] sm:text-xs text-emerald-300/80 leading-relaxed min-w-0">
            {t('dashboard.energy_exempt_hint')}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {summary?.todayPaid ? (
            <p className="text-center text-xs text-emerald-400/90 py-1">{t('dashboard.energy_today_already_paid')}</p>
          ) : canPay ? (
            <button
              type="button"
              onClick={() => void payDaily()}
              disabled={paying}
              className="w-full text-center text-sm font-semibold py-3 rounded-xl transition-colors bg-yellow-500 hover:bg-yellow-400 text-black disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {payLabel}
            </button>
          ) : summary && !summary.todayExempt && quote && !quote.affordable ? (
            <p className="text-center text-xs text-red-400 py-1">
              {t('taxes.pay_insufficient', { currency: payCurrency })}
            </p>
          ) : null}
          <Link
            to="/taxes"
            onClick={() => setOpen(false)}
            className="w-full text-center text-sm font-semibold py-3 rounded-xl transition-colors border border-yellow-500/40 text-yellow-200 hover:bg-yellow-500/10"
          >
            {t('dashboard.energy_go_taxes')}
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full text-center text-xs text-gray-500 hover:text-gray-400 py-1.5 transition-colors"
          >
            {t('dashboard.energy_remind_later')}
          </button>
        </div>
      </div>
    </div>
  );
}
