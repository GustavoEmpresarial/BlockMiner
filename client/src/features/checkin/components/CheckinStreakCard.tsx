import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import type { CheckinPeriodInfo, CheckinStatusPayload } from '../lib/checkin.types';
import { formatCheckinNextReset } from '../lib/checkinHelpers';
import Card from '../../../shared/components/Card';

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
    <Card overflowHidden className="relative p-6 sm:p-8 group">
      <div className="relative z-10">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">{t('checkin.streak')}</h3>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6">
          <div className="w-20 h-20 bg-gradient-to-tr from-amber-500/20 to-orange-600/20 border-2 border-amber-500/40 rounded-2xl flex items-center justify-center shadow-[2px_2px_0px_#000000] group-hover:scale-105 transition-transform duration-300 shrink-0">
            <Trophy className="text-amber-400 w-10 h-10" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl sm:text-6xl font-black text-white tracking-tight font-mono">{streak}</span>
              <span className="text-lg sm:text-xl font-black text-amber-400 uppercase">{t('checkin.days')}</span>
            </div>
            <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">{t('checkin.streak_sub')}</p>
            <p className="text-[11px] text-slate-400 mt-2 leading-relaxed font-medium">{t('checkin.streak_daily_note')}</p>
            {graceEndsAt ? (
              <p className="text-[11px] text-amber-300 mt-1 font-medium">
                {t('checkin.grace_until', {
                  defaultValue: 'Grace period until {{time}}',
                  time: new Date(graceEndsAt).toLocaleString(),
                })}
              </p>
            ) : null}
            {period ? (
              <p className="text-[11px] text-slate-400 mt-1 font-medium">{formatCheckinNextReset(t, period)}</p>
            ) : nextResetAt ? (
              <p className="text-[11px] text-slate-400 mt-1 font-medium">
                {t('checkin.next_reset', {
                  defaultValue: 'Next reset: {{time}}',
                  time: new Date(nextResetAt).toLocaleString(),
                })}
              </p>
            ) : null}
            {totalConfirmed > 0 ? (
              <p className="text-[11px] text-slate-400 mt-2 font-medium">
                {t('checkin.total_days')}:{' '}
                <span className="text-white font-mono font-bold">{totalConfirmed}</span>
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="absolute bottom-0 right-0 w-48 h-48 bg-amber-500/5 rounded-tl-[100px] -z-0 pointer-events-none" />
    </Card>
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
