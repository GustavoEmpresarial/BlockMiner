import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isAxiosError } from 'axios';
import { api } from '../../shared/auth/auth.store';

type SeasonSummary = {
  id: number;
  title: string;
  subtitle?: string | null;
  state: 'live' | 'upcoming';
  startsAt: string;
  endsAt: string;
  bannerImageUrl?: string | null;
  maxLevel?: number;
};

type SeasonDetail = {
  season: SeasonSummary & { maxLevel: number; xpPerLevel: number };
  progress: { level: number; xpIntoLevel: number };
  missions: unknown[];
  rewards: Array<{
    id: number;
    level: number;
    claimed: boolean;
    rewardKind: string;
    title?: string;
    minerId?: number;
    hashRate?: number;
    hashRateDays?: number;
    blkAmount?: number;
    polAmount?: number;
  }>;
};

function formatSeasonDate(iso: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function msUntil(iso: string) {
  return Math.max(0, new Date(iso).getTime() - Date.now());
}

function formatCountdown(ms: number) {
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function MiniPassPage() {
  const { seasonId } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const parsedId = seasonId ? parseInt(seasonId, 10) : null;
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [detail, setDetail] = useState<SeasonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const loadSeasons = useCallback(async () => {
    const res = await api.get<{ ok?: boolean; seasons?: SeasonSummary[] }>('/mini-pass/seasons', {
      headers: { 'Accept-Language': i18n.language },
    });
    if (res.data?.ok) setSeasons(res.data.seasons ?? []);
  }, [i18n.language]);

  const loadDetail = useCallback(async () => {
    if (!parsedId) return;
    const res = await api.get<{ ok?: boolean } & SeasonDetail>(`/mini-pass/seasons/${parsedId}`, {
      headers: { 'Accept-Language': i18n.language },
    });
    if (res.data?.ok) setDetail(res.data as SeasonDetail);
    else {
      toast.error(t('miniPass.errors.load_failed'));
      navigate('/mini-pass');
    }
  }, [parsedId, i18n.language, navigate, t]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        if (parsedId) await loadDetail();
        else await loadSeasons();
      } catch {
        if (!cancelled) toast.error(t('miniPass.errors.network'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [parsedId, loadDetail, loadSeasons, t]);

  const endsIn = useMemo(() => {
    if (!detail?.season?.endsAt) return '';
    return formatCountdown(msUntil(detail.season.endsAt));
  }, [detail, tick]);

  const claim = async (levelRewardId: number) => {
    if (!parsedId) return;
    try {
      setBusyKey(`claim-${levelRewardId}`);
      const res = await api.post<{ ok?: boolean; duplicate?: boolean }>(
        `/mini-pass/seasons/${parsedId}/claim/${levelRewardId}`,
      );
      if (res.data?.ok) {
        toast.success(res.data.duplicate ? t('miniPass.claim_already') : t('miniPass.claim_ok'));
        await loadDetail();
      }
    } catch (err) {
      const code = isAxiosError(err) ? (err.response?.data as { code?: string })?.code : undefined;
      toast.error(
        t(
          code === 'not_eligible'
            ? 'miniPass.errors.not_eligible'
            : code === 'season_not_live'
              ? 'miniPass.errors.season_not_live'
              : 'miniPass.errors.claim_failed',
        ),
      );
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
      </div>
    );
  }

  if (!parsedId) {
    return (
      <div className="space-y-8">
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">{t('miniPass.title')}</h1>
        <p className="text-slate-400 text-sm">{t('miniPass.subtitle')}</p>
        {seasons.length === 0 ? (
          <p className="text-slate-500">{t('miniPass.no_seasons')}</p>
        ) : (
          <ul className="space-y-3">
            {seasons.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/mini-pass/${s.id}`}
                  className="block rounded-2xl border border-white/10 bg-slate-900/50 p-5 hover:border-amber-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="font-bold text-white">{s.title}</h2>
                      {s.subtitle ? <p className="text-xs text-slate-500 mt-1">{s.subtitle}</p> : null}
                      <p className="text-[11px] text-slate-500 mt-2">
                        {s.state === 'live'
                          ? t('miniPass.ends_at', { date: formatSeasonDate(s.endsAt, i18n.language) })
                          : t('miniPass.starts_at', { date: formatSeasonDate(s.startsAt, i18n.language) })}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-amber-400 shrink-0" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (!detail) return null;

  const { season, progress, rewards } = detail;
  const progressPct =
    progress.level >= season.maxLevel
      ? 100
      : Math.min(100, (progress.xpIntoLevel / Math.max(1, season.xpPerLevel)) * 100);

  return (
    <div className="space-y-8 pb-12">
      <button
        type="button"
        onClick={() => navigate('/mini-pass')}
        className="flex items-center gap-2 text-slate-400 hover:text-white text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('miniPass.back')}
      </button>
      <header className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-6 md:p-8">
        <h1 className="text-2xl font-black text-white">{season.title}</h1>
        <p className="text-sm text-slate-400 mt-2">
          {t('miniPass.level_label')} {progress.level} / {season.maxLevel}
          {season.state === 'live' && endsIn ? ` · ${t('miniPass.ends_in')} ${endsIn}` : null}
        </p>
        <div className="mt-4 h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full bg-amber-500 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </header>
      <section className="space-y-3">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('miniPass.rewards_track')}</h2>
        {rewards.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/40 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-white">
                {t('miniPass.complete_modal.reward_level', { level: r.level })} — {r.title || r.rewardKind}
              </p>
            </div>
            {r.claimed ? (
              <span className="text-xs font-bold text-slate-500">{t('miniPass.claimed')}</span>
            ) : (
              <button
                type="button"
                disabled={busyKey != null}
                onClick={() => void claim(r.id)}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-black uppercase"
              >
                {t('miniPass.claim')}
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
