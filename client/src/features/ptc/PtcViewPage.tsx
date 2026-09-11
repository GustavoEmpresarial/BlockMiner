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

  if (loading) return (
    <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!settings?.isEnabled) return (
    <div className=" text-center py-20">
      <p className="text-gray-500 font-black uppercase tracking-widest text-sm">
        {t('ptc.disabled')}
      </p>
    </div>
  );

  return (
    <div className=" space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight uppercase italic">{t('ptc.view_title')}</h1>
          <p className="text-gray-500 text-sm font-medium mt-1">
            {t('ptc.view_subtitle_before')}{' '}
            <span className="text-orange-400 font-black">SHIBA INU</span>{' '}
            {t('ptc.view_subtitle_after')}
          </p>
        </div>
        <Link
          to="/ptc/campaigns"
          className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all hover:scale-[1.02] shadow-lg shadow-orange-500/20 shrink-0"
        >
          <Megaphone className="w-4 h-4" />
          {t('ptc.my_campaigns_link')}
        </Link>
      </div>

      {showViewingMode ? (
        <div className=" w-full">
          <ActiveSessionView onDone={() => setViewingAd(false)} />
        </div>
      ) : (
        <AdGridView onSelectAd={() => setViewingAd(true)} />
      )}

      

      
    </div>
  );
}

