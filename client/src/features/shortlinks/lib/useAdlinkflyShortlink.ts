import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { isAxiosError } from 'axios';
import { reportApiFailure } from '../../../shared/utils/reportApiFailure';
import { t } from './shortlinks.i18n';
import {
  readAdlinkflyExternalUrl,
  readAdlinkflyToken,
  syncAdlinkflyExternalUrl,
  syncAdlinkflyToken,
  clearAdlinkflySessionStorage,
} from './adlinkflyStorage';
import { useAdlinkflyBroadcast } from './adlinkflyBroadcast';
import { claimAdlinkflyWithRetry } from './adlinkflyClaim';
import {
  readApiErrorMessage,
  startAdlinkflyShortlink,
  type ExternalShortlinkStatusPayload,
} from './shortlinks.api';

const PENDING_STATUS_POLL_MS = 12_000;

export function useAdlinkflyShortlink(
  adlinkfly: ExternalShortlinkStatusPayload | null,
  setAdlinkfly: Dispatch<SetStateAction<ExternalShortlinkStatusPayload | null>>,
  refreshStatus: () => Promise<void>,
) {
  const [isStarting, setIsStarting] = useState(false);
  const [isAutoClaiming, setIsAutoClaiming] = useState(false);
  const [claimPhase, setClaimPhase] = useState<'idle' | 'claiming' | 'waiting'>('idle');
  const autoClaimLock = useRef(false);
  const adlinkflyRef = useRef(adlinkfly);
  adlinkflyRef.current = adlinkfly;

  useEffect(() => {
    syncAdlinkflyToken(adlinkfly?.pendingToken);
  }, [adlinkfly?.pendingToken]);

  const runAutoClaim = useCallback(
    async (tokenOverride?: string | null) => {
      if (autoClaimLock.current) return;
      const current = adlinkflyRef.current;
      if (!current?.pending) return;

      autoClaimLock.current = true;
      setIsAutoClaiming(true);
      setClaimPhase('claiming');

      try {
        const token = tokenOverride || current.pendingToken || readAdlinkflyToken();
        const outcome = await claimAdlinkflyWithRetry(token, {
          onWaiting: () => setClaimPhase('waiting'),
        });

        if (outcome.ok) {
          clearAdlinkflySessionStorage();
          toast.success(outcome.message);
          await refreshStatus();
          return;
        }

        if (outcome.code !== 'SHORTLINK_TOO_FAST') {
          reportApiFailure({ operation: 'adlinkfly_shortlink_auto_claim', message: outcome.message });
        }
      } finally {
        autoClaimLock.current = false;
        setIsAutoClaiming(false);
        setClaimPhase('idle');
      }
    },
    [refreshStatus],
  );

  const onClaimed = useCallback(
    (message: string) => {
      clearAdlinkflySessionStorage();
      void refreshStatus();
      if (message.trim()) toast.success(message.trim());
    },
    [refreshStatus],
  );

  const onDone = useCallback(
    (token: string | null) => {
      void runAutoClaim(token);
    },
    [runAutoClaim],
  );

  useAdlinkflyBroadcast({ onClaimed, onDone });

  const handleStart = useCallback(async () => {
    if (!adlinkfly?.enabled || isStarting) return;

    try {
      setIsStarting(true);
      const data = await startAdlinkflyShortlink();
      if (data.ok && data.token && data.externalUrl) {
        syncAdlinkflyToken(data.token);
        syncAdlinkflyExternalUrl(data.externalUrl);
        setAdlinkfly((prev) =>
          prev
            ? {
                ...prev,
                pending: true,
                pendingToken: data.token ?? null,
                doneReached: false,
              }
            : prev,
        );
        window.location.assign(data.externalUrl);
        return;
      }
      toast.error(t('shortlinks.pastead_start_failed'));
    } catch (err: unknown) {
      const msg = readApiErrorMessage(err, t('shortlinks.pastead_start_failed'));
      toast.error(msg);
      reportApiFailure({
        operation: 'adlinkfly_shortlink_start',
        message: msg,
        statusCode: isAxiosError(err) ? err.response?.status : undefined,
      }, err);
    } finally {
      setIsStarting(false);
    }
  }, [adlinkfly?.enabled, isStarting, setAdlinkfly]);

  const handleReopen = useCallback(async () => {
    if (!adlinkfly?.enabled || isStarting) return;

    const cachedUrl = readAdlinkflyExternalUrl();
    if (cachedUrl) {
      window.location.assign(cachedUrl);
      return;
    }

    await handleStart();
  }, [adlinkfly?.enabled, isStarting, handleStart]);

  useEffect(() => {
    if (!adlinkfly?.pending || !adlinkfly.doneReached) return undefined;

    const tryClaimIfReady = () => {
      if (document.visibilityState !== 'visible') return;
      const token = adlinkfly.pendingToken || readAdlinkflyToken();
      if (!token) return;
      const readyAt = adlinkfly.claimReadyAt ? Date.parse(adlinkfly.claimReadyAt) : 0;
      if (readyAt > 0 && Date.now() < readyAt) return;
      void runAutoClaim(token);
    };

    tryClaimIfReady();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshStatus();
      tryClaimIfReady();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [
    adlinkfly?.pending,
    adlinkfly?.doneReached,
    adlinkfly?.claimReadyAt,
    adlinkfly?.pendingToken,
    refreshStatus,
    runAutoClaim,
  ]);

  useEffect(() => {
    if (!adlinkfly?.pending) return undefined;
    const tick = () => {
      if (document.visibilityState !== 'visible' || isAutoClaiming) return;
      void refreshStatus();
    };
    const id = window.setInterval(tick, PENDING_STATUS_POLL_MS);
    return () => window.clearInterval(id);
  }, [adlinkfly?.pending, refreshStatus, isAutoClaiming]);

  return {
    isStarting,
    isAutoClaiming,
    claimPhase,
    handleStart,
    handleReopen,
  };
}
