import { useTranslation } from 'react-i18next';
import { Check, Loader2, Zap } from 'lucide-react';
import type { CheckinCadenceDailySlice, CheckinPeriodInfo } from '../lib/checkin.types';
import {
  formatCheckinAvailableUntil,
  formatCheckinNextReset,
  formatCheckinPeriodRange,
} from '../lib/checkinHelpers';
import Card from '../../../shared/components/Card';

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
    <Card className="p-6 sm:p-8 space-y-5">
      <div>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
          {t('checkin.period.current_title')}
        </h3>
        <p className="text-sm text-amber-400 mt-1 font-bold">{formatCheckinPeriodRange(t, period)}</p>
        <p className="text-[11px] text-slate-400 mt-1 font-medium">{t('checkin.daily_pay_hint')}</p>
        {lastCheckinOutsidePeriod && lastCheckinDateKey ? (
          <p className="text-[10px] text-slate-500 mt-1 font-medium">
            {t('checkin.period.last_confirmed', { dateKey: lastCheckinDateKey })}
          </p>
        ) : null}
      </div>

      {daily.checkedIn ? (
        <div className="text-center space-y-3 py-3 rounded-2xl border-2 border-emerald-500/30 bg-emerald-950/20 shadow-[2px_2px_0px_#000000]">
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border-2 border-emerald-500/30 flex items-center justify-center shadow-[2px_2px_0px_#000000]">
              <Check className="w-7 h-7 text-emerald-400" />
            </div>
          </div>
          <p className="text-lg font-black text-white">{t('checkin.claimed_period')}</p>
          <p className="text-xs text-slate-400 font-medium">
            {period ? formatCheckinNextReset(t, period) : t('checkin.come_back')}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-950/20 px-4 py-3 text-center shadow-[2px_2px_0px_#000000]">
          <p className="text-sm font-black text-emerald-400">{t('checkin.available')}</p>
          {period ? (
            <p className="text-[11px] text-slate-400 mt-1 font-medium">{formatCheckinAvailableUntil(t, period)}</p>
          ) : null}
        </div>
      )}

      {!daily.checkedIn ? (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-sky-500/25 bg-sky-950/20 p-4 shadow-[2px_2px_0px_#000000]">
            <div className="flex items-center justify-center gap-2 text-center font-bold text-sky-400 text-sm tracking-tight">
              <Zap className="h-4 w-4 shrink-0" aria-hidden />
              <span>{t('checkin.balance_pay_line')}</span>
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-2 leading-relaxed font-medium">
              {t('checkin.balance_pool_note', { balance: polBalance.toFixed(4) })}
            </p>
          </div>
          {daily.failed ? (
            <p className="text-red-400 text-sm text-center font-bold">{t('checkin.failed_retry')}</p>
          ) : null}
          {!canPay ? (
            <p className="text-center text-xs text-amber-400 leading-relaxed px-1 font-bold">
              {t('checkin.errors.INSUFFICIENT_BALANCE')}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onClaim}
            disabled={claiming || !canPay || daily.checkedIn}
            aria-busy={claiming}
            className="flex w-full min-h-[3.5rem] flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 rounded-xl border-2 border-sky-400 bg-sky-500 hover:bg-sky-400 active:translate-x-0.5 active:translate-y-0.5 px-4 py-3 text-slate-950 shadow-[2px_2px_0px_#000000] disabled:opacity-50 disabled:pointer-events-none transition-all outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            {claiming ? (
              <Loader2 className="h-5 w-5 animate-spin shrink-0 text-slate-950" />
            ) : (
              <Zap className="h-5 w-5 shrink-0 text-slate-950" aria-hidden />
            )}
            <span className="flex flex-col items-center justify-center gap-0.5 text-center leading-tight">
              <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.12em] text-slate-950">
                {t('checkin.cta_balance_line1')}
              </span>
              <span className="text-xs sm:text-sm font-black tracking-wide normal-case text-slate-950">
                {t('checkin.cta_balance_line2')}
              </span>
            </span>
          </button>
        </div>
      ) : null}
    </Card>
  );
}
