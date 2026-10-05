import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Eye, Timer, CheckCircle2, Gift, Loader2, ExternalLink,
  Info, Megaphone, AlertCircle, PauseCircle, XCircle, RefreshCw,
  Globe, PlayCircle,
} from 'lucide-react';
import { api } from '../../shared/auth/auth.store';
import { usePtcSessionStore } from './lib/ptcSession.store';

// ── Types ─────────────────────────────────────────────────────────────────────

import {
  SitePreview,
  SkeletonCard,
  StatsStrip,
  UtcResetBanner,
} from './components/ptc.shared';
import type {
  PtcAd,
  PtcDailyReset,
  PtcSettings,
  SessionApiResponse,
} from './components/ptc.shared';
import {
  ActiveSessionView,
  AdCard,
  AdGridView,
} from './components/ptc.adCard';

export default function PtcViewPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<PtcSettings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [viewingAd, setViewingAd] = useState(false);

  const storeSession       = usePtcSessionStore((s) => s.session);
  const storeStatus        = usePtcSessionStore((s) => s.status);
  const storeAccumulatedMs = usePtcSessionStore((s) => s.accumulatedMs);
  const setStoreSession    = usePtcSessionStore((s) => s.setSession);
  const clearSession       = usePtcSessionStore((s) => s.clear);

  // suppress unused-var lint for storeAccumulatedMs (referenced by store)
  void storeAccumulatedMs;

  // On mount: recover active session
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [settingsRes, sessionRes] = await Promise.all([
          api.get<{ ok: boolean; settings: PtcSettings }>('/ptc/settings'),
          api.get<{ ok: boolean; session: SessionApiResponse | null }>('/ptc/session/active'),
        ]);
        setSettings(settingsRes.data.settings);

        const active = sessionRes.data.session;
        if (active) {
          const adData = active.ad;
          setStoreSession(
            {
              sessionId:       active.id,
              adId:            adData.id,
              adTitle:         adData.title,
              adUrl:           adData.url,
              adType:          adData.adType,
              requiredSeconds: adData.durationSeconds,
              rewardShib:      adData.rewardPerViewShib,
            },
            active.status as 'opening' | 'viewing' | 'paused' | 'completed',
            active.accumulatedMs,
          );
          setViewingAd(true);
        } else {
          clearSession();
        }
      } catch {
        toast.error(t('ptc.load_error'));
      } finally {
        setLoading(false);
      }
    };
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isInActiveSession = Boolean(storeSession) &&
    ['opening', 'viewing', 'paused', 'completed'].includes(storeStatus);
  const showViewingMode = viewingAd || isInActiveSession;

  const pageHeader = (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase italic">{t('ptc.view_title')}</h1>
        <p className="text-slate-400 text-xs sm:text-sm font-medium mt-1">
          {t('ptc.view_subtitle_before')}{' '}
          <span className="text-orange-400 font-black">SHIBA INU</span>{' '}
          {t('ptc.view_subtitle_after')}
        </p>
      </div>
      <Link
        to="/ptc/campaigns"
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-orange-700 hover:bg-orange-800 active:translate-x-0.5 active:translate-y-0.5 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-[2px_2px_0px_#000000] shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Megaphone className="w-4 h-4" />
        {t('ptc.my_campaigns_link')}
      </Link>
    </div>
  );

  if (loading) return (
    <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {pageHeader}
      <div className="h-[45vh] flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-slate-800 bg-slate-900/60 shadow-[4px_4px_0px_#000000]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 font-extrabold uppercase tracking-widest text-xs">{t('common.loading')}</p>
      </div>
    </div>
  );

  if (!settings?.isEnabled) return (
    <div className="py-20 text-center">
      <div className="max-w-md mx-auto p-12 bg-slate-900/60 border-2 border-slate-800 rounded-3xl shadow-[4px_4px_0px_#000000]">
        <p className="text-slate-400 font-black uppercase tracking-widest text-sm">
          {t('ptc.disabled')}
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {pageHeader}

      {showViewingMode ? (
        <div className="w-full">
          <ActiveSessionView onDone={() => setViewingAd(false)} />
        </div>
      ) : (
        <AdGridView onSelectAd={() => setViewingAd(true)} />
      )}
    </div>
  );
}

