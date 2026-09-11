import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { isAxiosError } from 'axios';
import { reportApiFailure } from '../../../shared/utils/reportApiFailure';
import { t } from './shortlinks.i18n';
import {
  readPasteadExternalUrl,
  readPasteadToken,
  syncPasteadExternalUrl,
  syncPasteadToken,
  clearPasteadSessionStorage,
} from './pasteadStorage';
import { usePasteadBroadcast } from './pasteadBroadcast';
import {
  prepareZeradsShortlinkPopup,
  showZeradsPopupLoading,
  navigateZeradsShortlinkPopup,
  closeZeradsShortlinkPopup,
  openZeradsShortlinkWindow,
  isZeradsPopupUsable,
} from './pasteadSession';
import { claimPasteadWithRetry } from './pasteadClaim';
import { readApiErrorMessage, startPasteadShortlink, type PasteadStatusPayload } from './shortlinks.api';

const PENDING_STATUS_POLL_MS = 12_000;

export type { PasteadStatusPayload };

export function useZeradsShortlink(
  pastead: PasteadStatusPayload | null,
  setPastead: Dispatch<SetStateAction<PasteadStatusPayload | null>>,
  refreshStatus: () => Promise<void>,
) {
  const [isStarting, setIsStarting] = useState(false);
  const [isAutoClaiming, setIsAutoClaiming] = useState(false);
  const [claimPhase, setClaimPhase] = useState<'idle' | 'claiming' | 'waiting'>('idle');
  const autoClaimLock = useRef(false);
  const popupRef = useRef<Window | null>(null);
  const pasteadRef = useRef(pastead);
  pasteadRef.current = pastead;

  useEffect(() => {
    syncPasteadToken(pastead?.pendingToken);
  }, [pastead?.pendingToken]);

  const runAutoClaim = useCallback(
    async (tokenOverride?: string | null) => {
      if (autoClaimLock.current) return;
      const current = pasteadRef.current;
      if (!current?.pending) return;

      autoClaimLock.current = true;
      setIsAutoClaiming(true);
      setClaimPhase('claiming');

      try {
        const token = tokenOverride || current.pendingToken || readPasteadToken();
        const outcome = await claimPasteadWithRetry(token, {
          onWaiting: () => setClaimPhase('waiting'),
        });

        if (outcome.ok) {
          clearPasteadSessionStorage();
          toast.success(outcome.message);
          await refreshStatus();
          return;
        }

        if (outcome.code !== 'SHORTLINK_TOO_FAST') {
          reportApiFailure({ operation: 'pastead_shortlink_auto_claim', message: outcome.message });
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
      clearPasteadSessionStorage();
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

  usePasteadBroadcast({ onClaimed, onDone });

  const handleStart = useCallback(async () => {
    if (!pastead?.enabled || isStarting) return;

    const popup = prepareZeradsShortlinkPopup();
    if (!popup) {
      toast.error(t('shortlinks.pastead_popup_blocked'));
      return;
    }
    popupRef.current = popup;
    showZeradsPopupLoading(popup);

    try {
      setIsStarting(true);
      const data = await startPasteadShortlink();
      if (data.ok && data.token && data.externalUrl) {
        syncPasteadToken(data.token);
        syncPasteadExternalUrl(data.externalUrl);
        setPastead((prev) =>
          prev
            ? {
                ...prev,
                pending: true,
                pendingToken: data.token ?? null,
                doneReached: false,
              }
            : prev,
        );
        if (!isZeradsPopupUsable(popup)) {
          toast.error(t('shortlinks.pastead_popup_closed_early'));
          return;
        }
        navigateZeradsShortlinkPopup(popup, data.externalUrl);
        toast.message(t('shortlinks.pastead_opened_hint'));
        await refreshStatus();
        return;
      }
      closeZeradsShortlinkPopup(popup);
      popupRef.current = null;
      toast.error(t('shortlinks.pastead_start_failed'));
    } catch (err: unknown) {
      closeZeradsShortlinkPopup(popup);
      popupRef.current = null;
      const msg = readApiErrorMessage(err, t('shortlinks.pastead_start_failed'));
      toast.error(msg);
      reportApiFailure({
        operation: 'pastead_shortlink_start',
        message: msg,
        statusCode: isAxiosError(err) ? err.response?.status : undefined,
      }, err);
    } finally {
      setIsStarting(false);
    }
  }, [pastead?.enabled, isStarting, refreshStatus, setPastead]);

  const handleReopen = useCallback(async () => {
    if (!pastead?.enabled || isStarting) return;

    const cachedUrl = readPasteadExternalUrl();
    if (cachedUrl) {
      const popup = openZeradsShortlinkWindow(cachedUrl);
      if (!popup) {
        toast.error(t('shortlinks.pastead_popup_blocked'));
        return;
      }
      popupRef.current = popup;
      toast.message(t('shortlinks.pastead_opened_hint'));
      return;
    }

    await handleStart();
  }, [pastead?.enabled, isStarting, handleStart]);

  // Only claim after ZerAds success (doneReached). Never on timer alone.
  useEffect(() => {
    if (!pastead?.pending || !pastead.doneReached) return undefined;

    const tryClaimIfReady = () => {
      if (document.visibilityState !== 'visible') return;
      const token = pastead.pendingToken || readPasteadToken();
      if (!token) return;
      const readyAt = pastead.claimReadyAt ? Date.parse(pastead.claimReadyAt) : 0;
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
    pastead?.pending,
    pastead?.doneReached,
    pastead?.claimReadyAt,
    pastead?.pendingToken,
    refreshStatus,
    runAutoClaim,
  ]);

  useEffect(() => {
    if (!pastead?.pending) return undefined;
    const tick = () => {
      if (document.visibilityState !== 'visible' || isAutoClaiming) return;
      void refreshStatus();
    };
    const id = window.setInterval(tick, PENDING_STATUS_POLL_MS);
    return () => window.clearInterval(id);
  }, [pastead?.pending, refreshStatus, isAutoClaiming]);

  return {
    isStarting,
    isAutoClaiming,
    claimPhase,
    handleStart,
    handleReopen,
  };
}
