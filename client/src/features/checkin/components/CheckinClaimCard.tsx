import { useTranslation } from 'react-i18next';
import { Check, Loader2, Zap } from 'lucide-react';
import type { CheckinCadenceDailySlice, CheckinPeriodInfo } from '../lib/checkin.types';
import {
  formatCheckinAvailableUntil,
  formatCheckinNextReset,
  formatCheckinPeriodRange,
} from '../lib/checkinHelpers';

type Props = {
  daily: CheckinCadenceDailySlice;
  period: CheckinPeriodInfo | null;
  polBalance: number;
  canPay: boolean;
  claiming: boolean;
  lastCheckinOutsidePeriod?: boolean;
  lastCheckinDateKey?: string;
  onClaim: () => void;
};

export function CheckinClaimCard({
  daily,
  period,
  polBalance,
  canPay,
  claiming,
  lastCheckinOutsidePeriod,
  lastCheckinDateKey,
  onClaim,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="bg-surface border border-gray-800/50 rounded-[2rem] p-6 shadow-xl space-y-4">
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em]">
          {t('checkin.period.current_title')}
        </h3>
        <p className="text-sm text-amber-500/90 mt-1 font-medium">{formatCheckinPeriodRange(t, period)}</p>
        <p className="text-[11px] text-slate-600 mt-1">{t('checkin.daily_pay_hint')}</p>
        {lastCheckinOutsidePeriod && lastCheckinDateKey ? (
          <p className="text-[10px] text-slate-500 mt-1">
            {t('checkin.period.last_confirmed', { dateKey: lastCheckinDateKey })}
          </p>
        ) : null}
      </div>

      {daily.checkedIn ? (
        <div className="text-center space-y-3 py-1">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/25 flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
          </div>
          <p className="text-lg font-black text-white">{t('checkin.claimed_period')}</p>
          <p className="text-xs text-gray-500 font-medium">
            {period ? formatCheckinNextReset(t, period) : t('checkin.come_back')}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-center">
          <p className="text-sm font-bold text-emerald-400">{t('checkin.available')}</p>
          {period ? (
            <p className="text-[11px] text-slate-500 mt-1">{formatCheckinAvailableUntil(t, period)}</p>
          ) : null}
        </div>
      )}

      {!daily.checkedIn ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3">
            <div className="flex items-center justify-center gap-2 text-center font-bold text-primary text-sm tracking-tight">
              <Zap className="h-4 w-4 shrink-0" aria-hidden />
              <span>{t('checkin.balance_pay_line')}</span>
            </div>
            <p className="text-[10px] text-slate-500 text-center mt-2 leading-relaxed">
              {t('checkin.balance_pool_note', { balance: polBalance.toFixed(4) })}
            </p>
          </div>
          {daily.failed ? (
            <p className="text-red-400 text-sm text-center">{t('checkin.failed_retry')}</p>
          ) : null}
          {!canPay ? (
            <p className="text-center text-xs text-amber-400/90 leading-relaxed px-1">
              {t('checkin.errors.INSUFFICIENT_BALANCE')}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onClaim}
            disabled={claiming || !canPay || daily.checkedIn}
            aria-busy={claiming}
            className="flex w-full min-h-[3.5rem] flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 rounded-2xl border border-sky-500/40 bg-sky-500/15 px-4 py-3 text-sky-100 shadow-md hover:bg-sky-500/25 disabled:opacity-50"
          >
            {claiming ? (
              <Loader2 className="h-5 w-5 animate-spin shrink-0" />
            ) : (
              <Zap className="h-5 w-5 shrink-0 text-sky-400" aria-hidden />
            )}
            <span className="flex flex-col items-center justify-center gap-0.5 text-center leading-tight">
              <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.12em] text-sky-400/95">
                {t('checkin.cta_balance_line1')}
              </span>
              <span className="text-xs sm:text-sm font-black tracking-wide normal-case">
                {t('checkin.cta_balance_line2')}
              </span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
