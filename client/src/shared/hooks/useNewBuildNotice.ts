import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { forceReloadForNewBuild, getNewServerBuildId } from '../utils/chunkLoadError';

/** How often an open tab asks whether a new build was deployed (one small index.html GET, no API/DB). */
export const NEW_BUILD_POLL_MS = 5 * 60_000;
const FOCUS_RECHECK_MIN_MS = 60_000;
const NAV_RELOAD_KEY = 'blockminer:new-build-nav-reload';
const TOAST_ID = 'bm-new-build';

function alreadyNavReloadedFor(buildId: string): boolean {
  try {
    return window.sessionStorage.getItem(NAV_RELOAD_KEY) === buildId;
  } catch {
    return true; // no storage → no loop guard → never auto-reload
  }
}

function markNavReloaded(buildId: string): void {
  try {
    window.sessionStorage.setItem(NAV_RELOAD_KEY, buildId);
  } catch {
    /* ignore */
  }
}

/**
 * Open tabs keep running the JS they loaded, so client fixes only reached players who happened to
 * reload. Once a new build is confirmed: show a reload notice, and switch on the next page change
 * (the player is leaving that page anyway — never yank them out of a video or a form mid-use).
 */
export function useNewBuildNotice(): void {
  const { t } = useTranslation();
  const location = useLocation();
  const [newBuild, setNewBuild] = useState<string | null>(null);
  const detectedAtPath = useRef<string | null>(null);
  const lastCheck = useRef(0);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (newBuild) return undefined;
    let cancelled = false;
    const check = async () => {
      lastCheck.current = Date.now();
      const id = await getNewServerBuildId();
      if (!cancelled && id) setNewBuild(id);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current >= FOCUS_RECHECK_MIN_MS) void check();
    };
    const timer = setInterval(() => void check(), NEW_BUILD_POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [newBuild]);

  useEffect(() => {
    if (!newBuild) return;
    toast(tRef.current('shell.new_version_message'), {
      id: TOAST_ID,
      duration: Infinity,
      action: { label: tRef.current('shell.new_version_reload'), onClick: () => forceReloadForNewBuild() },
    });
  }, [newBuild]);

  useEffect(() => {
    if (!newBuild) return;
    if (detectedAtPath.current == null) {
      detectedAtPath.current = location.pathname;
      return;
    }
    if (location.pathname === detectedAtPath.current || alreadyNavReloadedFor(newBuild)) return;
    markNavReloaded(newBuild);
    forceReloadForNewBuild();
  }, [newBuild, location.pathname]);
}
