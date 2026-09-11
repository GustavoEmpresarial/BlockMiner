import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import type { CheckinPeriodInfo, CheckinStatusPayload } from '../lib/checkin.types';
import { formatCheckinNextReset } from '../lib/checkinHelpers';

type Props = {
  streak: number;
  totalConfirmed: number;
  graceEndsAt?: string | null;
  period: CheckinPeriodInfo | null;
  nextResetAt?: string | null;
};

export function CheckinStreakCard({ streak, totalConfirmed, graceEndsAt, period, nextResetAt }: Props) {
  const { t } = useTranslation();

  return (
    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-10 shadow-xl relative overflow-hidden group">
      <div className="relative z-10">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-[0.2em] mb-8">{t('checkin.streak')}</h3>
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-3xl flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform duration-500">
            <Trophy className="text-white w-12 h-12" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl font-black text-white tracking-tighter">{streak}</span>
              <span className="text-xl font-bold text-amber-500 uppercase">{t('checkin.days')}</span>
            </div>
            <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">{t('checkin.streak_sub')}</p>
            <p className="text-[10px] text-slate-600 mt-2 leading-relaxed">{t('checkin.streak_daily_note')}</p>
            {graceEndsAt ? (
              <p className="text-[10px] text-amber-500/90 mt-1">
                {t('checkin.grace_until', {
                  defaultValue: 'Grace period until {{time}}',
                  time: new Date(graceEndsAt).toLocaleString(),
                })}
              </p>
            ) : null}
            {period ? (
              <p className="text-[10px] text-slate-600 mt-1">{formatCheckinNextReset(t, period)}</p>
            ) : nextResetAt ? (
              <p className="text-[10px] text-slate-600 mt-1">
                {t('checkin.next_reset', {
                  defaultValue: 'Next reset: {{time}}',
                  time: new Date(nextResetAt).toLocaleString(),
                })}
              </p>
            ) : null}
            {totalConfirmed > 0 ? (
              <p className="text-[10px] text-slate-600 mt-2">
                {t('checkin.total_days')}:{' '}
                <span className="text-slate-400 font-mono">{totalConfirmed}</span>
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="absolute bottom-0 right-0 w-48 h-48 bg-amber-500/5 rounded-tl-[100px] -z-0" />
    </div>
  );
}

export function streakCardPropsFromStatus(status: CheckinStatusPayload, period: CheckinPeriodInfo | null): Props {
  return {
    streak: status.streak ?? 0,
    totalConfirmed: status.totalConfirmed ?? 0,
    graceEndsAt: status.graceEndsAt,
    period,
    nextResetAt: status.nextResetAt,
  };
}
