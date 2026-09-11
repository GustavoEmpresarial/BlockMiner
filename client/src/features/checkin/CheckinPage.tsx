import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isAxiosError } from 'axios';
import { fetchCheckinStatus, postCheckinBalanceDaily } from './lib/checkin.api';
import type { CheckinPeriodInfo, CheckinStatusPayload } from './lib/checkin.types';
import { CHECKIN_STATUS_POLL_MS } from './lib/checkin.config';
import {
  balanceCoversWeiCost,
  formatPolFromWei,
  getDailySlice,
  mergeStatus,
  statusNeedsCheckinPoll,
} from './lib/checkinHelpers';
import {
  readAxiosHttpStatus,
  readAxiosResponseMessage,
  shouldStopApiPolling,
} from './lib/httpPollingGuard';
import { CheckinClaimCard } from './components/CheckinClaimCard';
import { CheckinGraceBanner } from './components/CheckinGraceBanner';
import { CheckinHistorySection } from './components/CheckinHistorySection';
import { CheckinMilestonesSection } from './components/CheckinMilestonesSection';
import { CheckinStreakCard, streakCardPropsFromStatus } from './components/CheckinStreakCard';

function readCheckinErrorPayload(error: unknown): { code?: string; message?: string } | null {
  if (!isAxiosError(error)) return null;
  const data = error.response?.data;
  if (!data || typeof data !== 'object') return null;
  const record = data as { code?: unknown; message?: unknown };
  return {
    code: typeof record.code === 'string' ? record.code : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
  };
}

export function CheckinPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CheckinStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollStopped = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const claimInFlight = useRef(false);

  const resolveCheckinError = useCallback(
    (code: string | undefined, message: string | undefined) => {
      if (!code) return message || t('common.error');
      const key = `checkin.errors.${code}`;
      const translated = t(key);
      return translated === key ? message || t('common.error') : translated;
    },
    [t],
  );

  const load = useCallback(async () => {
    try {
      const data = await fetchCheckinStatus();
      if (data.ok) {
        setError(null);
        pollStopped.current = false;
        setStatus((prev) => mergeStatus(prev, data));
      } else {
        const msg = typeof data.message === 'string' ? data.message : t('checkin.unavailable');
        setError(msg);
        pollStopped.current = true;
        setStatus({ ok: false });
      }
    } catch (err) {
      const httpStatus = readAxiosHttpStatus(err);
      if (shouldStopApiPolling(httpStatus)) {
        pollStopped.current = true;
      }
      setError(readAxiosResponseMessage(err, t('checkin.unavailable')));
      setStatus({ ok: false });
    }
    return null;
  }, [t]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  useEffect(() => {
    if (pollStopped.current) {
      if (pollRef.current) clearInterval(pollRef.current);
      return undefined;
    }
    if (!status || !statusNeedsCheckinPoll(status)) {
      if (pollRef.current) clearInterval(pollRef.current);
      return undefined;
    }
    pollRef.current = setInterval(() => void load(), CHECKIN_STATUS_POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, load]);

  const daily = getDailySlice(status);
  const amountWei = status?.checkinBalanceAmountWei || '0';
  const polBalance = Number(status?.polBalance ?? 0);
  const canPay = balanceCoversWeiCost(polBalance, amountWei);

  const period: CheckinPeriodInfo | null =
    status?.currentPeriod ?? daily.currentPeriod ?? null;

  const claim = async () => {
    if (!amountWei) {
      toast.error(t('common.error'));
      return;
    }
    if (claimInFlight.current) return;
    claimInFlight.current = true;
    setClaiming(true);
    try {
      const res = await postCheckinBalanceDaily();
      if (res.ok && res.alreadyCheckedIn) {
        toast.success(t('checkin.claimed'));
        await load();
      } else if (res.ok && res.status === 'confirmed') {
        toast.success(t('checkin.reward_msg', { amount: `${formatPolFromWei(amountWei)} POL` }));
        await load();
      } else if (!res.ok) {
        toast.error(resolveCheckinError(res.code, res.message));
        await load();
      }
    } catch (err) {
      const payload = readCheckinErrorPayload(err);
      toast.error(resolveCheckinError(payload?.code, payload?.message));
      await load();
    } finally {
      claimInFlight.current = false;
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-gray-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  if (!status?.ok || status.statusDegraded) {
    return (
      <div className="p-8 text-center text-gray-400 space-y-3 max-w-md mx-auto">
        <p>{status?.statusDegraded ? t('checkin.status_degraded') : error || t('checkin.unavailable')}</p>
        {status?.statusDegraded ? <p className="text-xs text-slate-600">{t('checkin.status_degraded_hint')}</p> : null}
        {!status?.statusDegraded ? (
          <button
            type="button"
            onClick={() => {
              pollStopped.current = false;
              void load();
            }}
            className="mt-2 px-4 py-2 rounded-xl bg-surface border border-gray-700 text-sm font-semibold text-white hover:border-primary/50"
          >
            {t('common.retry')}
          </button>
        ) : null}
      </div>
    );
  }

  const lastCheckin = status.lastCheckin;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="text-center space-y-4">
        <div className="inline-flex p-3 bg-amber-500/10 rounded-2xl mb-2">
          <Calendar className="w-8 h-8 text-amber-500" />
        </div>
        <h1 className="text-4xl font-black text-white tracking-tight">{t('checkin.title')}</h1>
        <p className="text-gray-500 font-medium max-w-lg mx-auto">{t('checkin.subtitle_balance_only')}</p>
      </div>

      {status.graceEndsAt ? <CheckinGraceBanner graceEndsAt={status.graceEndsAt} /> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <CheckinStreakCard {...streakCardPropsFromStatus(status, period)} />
        <CheckinClaimCard
          daily={daily}
          period={period}
          polBalance={polBalance}
          canPay={canPay}
          claiming={claiming}
          lastCheckinOutsidePeriod={Boolean(lastCheckin && !lastCheckin.isCurrentPeriod)}
          lastCheckinDateKey={lastCheckin?.dateKey}
          onClaim={() => void claim()}
        />
      </div>

      <CheckinHistorySection recentCheckins={status.recentCheckins} />

      <p className="text-center text-xs text-slate-600 max-w-xl mx-auto">{t('checkin.server_note')}</p>

      <CheckinMilestonesSection milestones={status.milestones} />
    </div>
  );
}
