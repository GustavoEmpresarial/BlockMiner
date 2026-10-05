import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight, Loader2, Ticket } from 'lucide-react';
import Card from '../../shared/components/Card';
import IconBadge from '../../shared/components/IconBadge';
import SectionHeader from '../../shared/components/SectionHeader';
import StatusPill from '../../shared/components/StatusPill';
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

  const pageHero = (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
      <div className="flex items-center gap-3">
        <IconBadge icon={Ticket} variant="amber" size="lg" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">{t('miniPass.title')}</h1>
          <p className="text-slate-400 text-xs sm:text-sm font-medium">{t('miniPass.subtitle')}</p>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
        {pageHero}
        <Card className="flex justify-center py-16">
          <Loader2 className="w-10 h-10 animate-spin text-amber-400" />
        </Card>
      </div>
    );
  }

  if (!parsedId) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
        {pageHero}
        {seasons.length === 0 ? (
          <Card>
            <p className="text-slate-300 font-medium">{t('miniPass.no_seasons')}</p>
          </Card>
        ) : (
          <ul className="space-y-4">
            {seasons.map((s) => (
              <li key={s.id}>
                <Link to={`/mini-pass/${s.id}`} className="block">
                  <Card className="hover:border-amber-400 transition-colors">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="font-black uppercase tracking-tight text-white">{s.title}</h2>
                        {s.subtitle ? <p className="text-xs text-slate-400 mt-1 font-medium">{s.subtitle}</p> : null}
                        <p className="text-[11px] text-slate-300 mt-2 font-medium">
                          {s.state === 'live'
                            ? t('miniPass.ends_at', { date: formatSeasonDate(s.endsAt, i18n.language) })
                            : t('miniPass.starts_at', { date: formatSeasonDate(s.startsAt, i18n.language) })}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-amber-400 shrink-0" />
                    </div>
                  </Card>
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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <IconBadge icon={Ticket} variant="amber" size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white truncate">{season.title}</h1>
            <p className="text-slate-400 text-xs sm:text-sm font-medium">
              {t('miniPass.level_label')} {progress.level} / {season.maxLevel}
              {season.state === 'live' && endsIn ? ` · ${t('miniPass.ends_in')} ${endsIn}` : null}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/mini-pass')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border-2 border-slate-700 text-xs font-black uppercase tracking-wider text-slate-300 hover:text-white hover:border-slate-500 active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_#000000] transition-all outline-none focus-visible:ring-2 focus-visible:ring-amber-400 w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('miniPass.back')}
        </button>
      </div>
      <Card className="space-y-4">
        <div className="h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
          <div className="h-full bg-amber-400 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </Card>
      <section className="space-y-3">
        <SectionHeader icon={Ticket} iconVariant="amber" title={t('miniPass.rewards_track')} />
        {rewards.map((r) => (
          <Card key={r.id} variant="compact" className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">
                {t('miniPass.complete_modal.reward_level', { level: r.level })} — {r.title || r.rewardKind}
              </p>
            </div>
            {r.claimed ? (
              <StatusPill variant="success" label={t('miniPass.claimed')} />
            ) : (
              <button
                type="button"
                disabled={busyKey != null}
                onClick={() => void claim(r.id)}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:translate-x-0.5 active:translate-y-0.5 text-slate-950 text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_#000000] disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                {t('miniPass.claim')}
              </button>
            )}
          </Card>
        ))}
      </section>
    </div>
  );
}
