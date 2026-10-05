/**
 * External Offerwall hub — Zerads / Offerwall.me / MoneyRain / Multiwall Ads / Offerwall.GG.
 * All providers share the same chrome: Stats tab | Offers tab (iframe or partner open).
 */
import { useEffect, useState, type ComponentType } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  LayoutGrid,
  Loader2,
  Wrench,
  MousePointerClick,
  CloudRain,
  type LucideProps,
} from 'lucide-react';
import { toast } from 'sonner';
import Card from '../../shared/components/Card';
import IconBadge from '../../shared/components/IconBadge';
import { api } from '../../shared/auth/auth.store';
import { t } from './lib/offerwall.i18n';
import { openPartnerSafe, fetchOfferwallLinkWithPass } from './lib/offerwallPass';
import type { BmCaptchaProvider } from '../bm-captcha/bm-captcha.types';
import {
  OfferwallProviderShell,
  OFFERWALL_ACCENTS,
  fmtBlk,
  fmtDate,
  fmtUsd,
  type OfferwallHistoryColumn,
  type OfferwallTab,
} from './OfferwallProviderShell';

const MULTIWALL_ADS_MAINTENANCE = false;
const OFFERWALLGG_MAINTENANCE = true;
const OFFERWALLME_MAINTENANCE = true;

const DEFAULT_OFFERWALL_RATE = 0.0005;

type Panel = BmCaptchaProvider | null;
type LucideIcon = ComponentType<LucideProps>;

type HubAccent = keyof typeof OFFERWALL_ACCENTS;

type HubProvider = {
  id: BmCaptchaProvider;
  name: string;
  description: string;
  rewardLabel: string;
  creditTime: string;
  accentColor: HubAccent;
  Icon: LucideIcon;
  maintenance?: boolean;
};

/** Hub card chrome — same brand palette as panels (SPA 118 `yF` / `VGe`). */
const HUB_CARD_ACCENT: Record<
  HubAccent,
  { border: string; bg: string; icon: string; badge: string }
> = {
  purple: {
    border: 'border-primary/25',
    bg: 'bg-primary/10',
    icon: 'text-primary',
    badge: 'bg-primary/15 text-primary border border-primary/25',
  },
  violet: {
    border: 'border-primary/25',
    bg: 'bg-primary/10',
    icon: 'text-primary',
    badge: 'bg-primary/15 text-primary border border-primary/25',
  },
  amber: {
    border: 'border-primary/25',
    bg: 'bg-primary/10',
    icon: 'text-primary',
    badge: 'bg-primary/15 text-primary border border-primary/25',
  },
  cyan: {
    border: 'border-primary/25',
    bg: 'bg-primary/10',
    icon: 'text-primary',
    badge: 'bg-primary/15 text-primary border border-primary/25',
  },
  emerald: {
    border: 'border-primary/25',
    bg: 'bg-primary/10',
    icon: 'text-primary',
    badge: 'bg-primary/15 text-primary border border-primary/25',
  },
};

function readOfferwallRate(stats: Record<string, unknown> | null | undefined, fallback = DEFAULT_OFFERWALL_RATE): number {
  const raw = stats?.blkPerClick ?? stats?.exchangeRate ?? stats?.rate;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizeHistoryRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object') {
    const entries = (data as { entries?: unknown }).entries;
    if (Array.isArray(entries)) return entries as Record<string, unknown>[];
  }
  return [];
}

function useStatsAndHistory(statsPath: string, historyPath: string) {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [history, setHistory] = useState<Record<string, unknown>[] | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  useEffect(() => {
    let dead = false;
    api
      .get(statsPath)
      .then((res) => {
        if (!dead) setStats(res.data?.ok ? res.data : {});
      })
      .catch(() => {
        if (!dead) setStats({});
      });
    return () => {
      dead = true;
    };
  }, [statsPath]);

  useEffect(() => {
    let dead = false;
    setHistLoading(true);
    api
      .get(historyPath)
      .then((res) => {
        if (!dead) setHistory(normalizeHistoryRows(res.data));
      })
      .catch(() => {
        if (!dead) setHistory([]);
      })
      .finally(() => {
        if (!dead) setHistLoading(false);
      });
    return () => {
      dead = true;
    };
  }, [historyPath]);

  return { stats, history, histLoading };
}

function OfferwallHubCard({ provider, onSelect }: { provider: HubProvider; onSelect: () => void }) {
  const accent = HUB_CARD_ACCENT[provider.accentColor] ?? HUB_CARD_ACCENT.purple;
  const { Icon } = provider;
  const isUnderMaintenance = Boolean(provider.maintenance);
  return (
    <Card variant="table" className={`flex flex-col ${isUnderMaintenance ? 'opacity-75' : ''}`}>
      <div className={`h-24 ${accent.bg} flex items-center justify-center relative border-b-2 border-slate-800`}>
        <Icon className={`w-10 h-10 ${accent.icon} drop-shadow-md`} />
        {isUnderMaintenance ? (
          <span className="absolute top-2.5 right-2.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/35 shadow-sm">
            {t('offerwall.panel.maintenance_badge')}
          </span>
        ) : null}
      </div>
      <div className="p-5 flex flex-col gap-3.5 flex-1">
        <div>
          <p className="text-base font-black text-white uppercase tracking-tight">{provider.name}</p>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed font-medium">{provider.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${accent.badge}`}>
            <Coins className="w-3.5 h-3.5" />
            {provider.rewardLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium px-2.5 py-1 rounded-full bg-slate-950 text-slate-400 border border-slate-800">
            <Clock className="w-3.5 h-3.5" />
            {provider.creditTime}
          </span>
        </div>
        <button
          type="button"
          onClick={isUnderMaintenance ? undefined : onSelect}
          disabled={isUnderMaintenance}
          className={`mt-auto w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all outline-none focus-visible:ring-2 ${
            isUnderMaintenance
              ? 'bg-slate-800/80 border-2 border-slate-700/60 text-slate-500 cursor-not-allowed opacity-60'
              : 'bg-sky-500 hover:bg-sky-400 active:translate-x-0.5 active:translate-y-0.5 text-slate-950 shadow-[2px_2px_0px_#000000] focus-visible:ring-sky-400'
          }`}
        >
          {isUnderMaintenance ? t('offerwall.panel.maintenance_badge') : t('offerwall.access')}
        </button>
      </div>
    </Card>
  );
}

function EmbedFrame({ title, url, loading }: { title: string; url: string | null; loading?: boolean }) {
  if (loading || !url) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin" />
        {t('offerwall.panel.loading')}
      </div>
    );
  }
  return (
    <iframe
      src={url}
      title={title}
      className="w-full"
      style={{ height: 800, border: 0, display: 'block' }}
      allow="fullscreen"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}

function usdOfferHistoryCols(): OfferwallHistoryColumn[] {
  return [
    {
      key: 'date',
      header: t('offerwall.panel.col_date'),
      render: (row) => fmtDate(row.createdAt),
    },
    {
      key: 'offer',
      header: t('offerwall.panel.col_offer'),
      cellClassName: 'text-gray-400',
      render: (row) => String(row.offerName || row.offerType || row.adType || '—'),
    },
    {
      key: 'usd',
      header: t('offerwall.panel.col_usd'),
      align: 'right',
      cellClassName: 'text-cyan-300',
      render: (row) => fmtUsd(row.payoutUsd ?? row.rewardUsdt),
    },
    {
      key: 'blk',
      header: t('offerwall.panel.col_pol'),
      align: 'right',
      cellClassName: 'font-medium text-green-400',
      render: (row) => `+${fmtBlk(row.polCredited ?? row.payoutAmount)}`,
    },
  ];
}

export default function OfferwallPage() {
  const [panel, setPanel] = useState<Panel>(null);
  const [offerwallMeMaintenance, setOfferwallMeMaintenance] = useState(OFFERWALLME_MAINTENANCE);

  useEffect(() => {
    api.get<{ ok?: boolean; maintenance?: boolean }>('/offerwallme/status')
      .then((res) => {
        if (typeof res.data?.maintenance === 'boolean') {
          setOfferwallMeMaintenance(res.data.maintenance);
        }
      })
      .catch(() => {});
  }, []);

  if (panel === 'zerads') return <ZeradsPanel onBack={() => setPanel(null)} />;
  if (panel === 'offerwallme') {
    if (offerwallMeMaintenance) return <MaintenancePanel onBack={() => setPanel(null)} msgKey="offerwall.offerwallme.maintenance_msg" />;
    return <OfferwallMePanel onBack={() => setPanel(null)} />;
  }
  if (panel === 'moneyrain') return <MoneyRainPanel onBack={() => setPanel(null)} />;
  if (panel === 'multiwall') {
    if (MULTIWALL_ADS_MAINTENANCE) return <MaintenancePanel onBack={() => setPanel(null)} msgKey="offerwall.multiwall.maintenance_msg" />;
    return <MultiwallPanel onBack={() => setPanel(null)} />;
  }
  if (panel === 'offerwallgg') {
    if (OFFERWALLGG_MAINTENANCE) return <MaintenancePanel onBack={() => setPanel(null)} msgKey="offerwall.multiwall.maintenance_msg" />;
    return <OfferwallGgPanel onBack={() => setPanel(null)} />;
  }

  const providers: HubProvider[] = [
    {
      id: 'zerads',
      name: 'Zerads PTC',
      description: t('offerwall.providers.zerads_desc'),
      rewardLabel: t('offerwall.providers.zerads_reward'),
      creditTime: t('offerwall.providers.zerads_credit'),
      accentColor: 'purple',
      Icon: MousePointerClick,
    },
    {
      id: 'offerwallme',
      name: 'Offerwall.me',
      description: t('offerwall.providers.offerwallme_desc'),
      rewardLabel: t('offerwall.providers.offerwallme_reward'),
      creditTime: t('offerwall.providers.offerwallme_credit'),
      accentColor: 'violet',
      Icon: LayoutGrid,
      maintenance: offerwallMeMaintenance,
    },
    {
      id: 'moneyrain',
      name: 'MoneyRain',
      description: t('offerwall.providers.moneyrain_desc'),
      rewardLabel: t('offerwall.providers.moneyrain_reward'),
      creditTime: t('offerwall.providers.moneyrain_credit'),
      accentColor: 'amber',
      Icon: CloudRain,
    },
    {
      id: 'multiwall',
      name: 'Multiwall Ads',
      description: t('offerwall.providers.multiwall_desc'),
      rewardLabel: t('offerwall.providers.multiwall_reward'),
      creditTime: t('offerwall.providers.multiwall_credit'),
      accentColor: 'cyan',
      Icon: LayoutGrid,
      maintenance: MULTIWALL_ADS_MAINTENANCE,
    },
    {
      id: 'offerwallgg',
      name: 'Offerwall.GG',
      description: t('offerwall.providers.offerwallgg_desc'),
      rewardLabel: t('offerwall.providers.offerwallgg_reward'),
      creditTime: t('offerwall.providers.offerwallgg_credit'),
      accentColor: 'emerald',
      Icon: LayoutGrid,
      maintenance: OFFERWALLGG_MAINTENANCE,
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
        <div className="flex items-center gap-3">
          <IconBadge icon={LayoutGrid} variant="primary" size="lg" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">{t('sidebar.offerwall')}</h1>
            <p className="text-slate-400 text-xs sm:text-sm font-medium">{t('offerwall.subtitle')}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {providers.map((p) => (
          <OfferwallHubCard key={p.id} provider={p} onSelect={() => setPanel(p.id)} />
        ))}
      </div>
    </div>
  );
}

function MaintenancePanel({ onBack, msgKey }: { onBack: () => void; msgKey: string }) {
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white">
        {t('offerwall.panel.back')}
      </button>
      <div className="flex items-center gap-3 justify-center py-10 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-300 text-sm px-4 text-center">
        <Wrench className="w-5 h-5 shrink-0" />
        {t(msgKey)}
      </div>
    </div>
  );
}

function ZeradsPanel({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<OfferwallTab>('stats');
  const { stats, history, histLoading } = useStatsAndHistory('/zerads/stats', '/zerads/history?page=1');
  const [opening, setOpening] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openZerads = async () => {
    setOpening(true);
    setPopupBlocked(false);
    setErrorMsg(null);
    try {
      const res = await fetchOfferwallLinkWithPass('zerads', '/zerads/link');
      if (res.ok) {
        setUrl(res.url);
        const opened = openPartnerSafe(res.url);
        if (!opened) {
          setPopupBlocked(true);
          toast.warning(t('offerwall.offerwallme.popup_blocked_hint'));
        }
      } else {
        if (res.code === 'CAPTCHA_CANCELLED') {
          toast.info(t('offerwall.offerwallme.captcha_cancelled'));
        } else if (res.code === 'NETWORK_ERROR') {
          setErrorMsg(t('offerwall.offerwallme.network_error'));
          toast.error(t('offerwall.offerwallme.network_error'));
        } else {
          const msg = res.message || t('zerads.load_error');
          setErrorMsg(msg);
          toast.error(msg);
        }
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message || t('zerads.load_error');
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setOpening(false);
    }
  };

  return (
    <OfferwallProviderShell
      onBack={onBack}
      title={t('zerads.title')}
      tagline={t('zerads.subtitle')}
      accent={OFFERWALL_ACCENTS.purple}
      Icon={MousePointerClick}
      backLabel={t('offerwall.panel.back')}
      tab={tab}
      onTabChange={setTab}
      statsCards={
        stats
          ? [
              { label: t('offerwall.panel.stat_total_zer'), value: `${Number(stats.totalZer || 0).toFixed(4)} ZER` },
              { label: t('offerwall.panel.stat_total_blk'), value: fmtBlk(stats.totalBlk ?? stats.totalPol) },
              { label: t('offerwall.panel.stat_total_clicks'), value: String(stats.totalClicks ?? 0) },
            ]
          : null
      }
      periodCards={
        stats
          ? [
              {
                label: t('offerwall.panel.period_today'),
                valueLabel: t('offerwall.panel.period_clicks', { count: Number(stats.clicksToday || 0) }),
              },
              {
                label: t('offerwall.panel.period_week'),
                valueLabel: t('offerwall.panel.period_clicks', { count: Number(stats.clicksWeek || 0) }),
              },
              {
                label: t('offerwall.panel.period_month'),
                valueLabel: t('offerwall.panel.period_clicks', { count: Number(stats.clicksMonth || 0) }),
              },
            ]
          : null
      }
      howItWorks={t('zerads.how_it_works_body')}
      rateNote={t('zerads.exchange_rate', { rate: readOfferwallRate(stats).toFixed(4) })}
      openOffersLabel={t('offerwall.panel.open_offers')}
      historyTitle={t('offerwall.panel.history_title')}
      historyEmpty={t('offerwall.panel.history_empty')}
      historyRecent={history?.length ? t('offerwall.panel.history_recent', { count: history.length }) : null}
      historyLoading={histLoading}
      historyRows={history}
      historyColumns={[
        { key: 'date', header: t('offerwall.panel.col_date'), render: (row) => fmtDate(row.callbackAt) },
        {
          key: 'clicks',
          header: t('offerwall.panel.col_clicks'),
          align: 'right',
          cellClassName: 'text-gray-400',
          render: (row) => String(row.clicks ?? 0),
        },
        {
          key: 'zer',
          header: t('offerwall.panel.col_zer'),
          align: 'right',
          cellClassName: 'text-purple-300',
          render: (row) => Number(row.amountZer || 0).toFixed(4),
        },
        {
          key: 'blk',
          header: t('offerwall.panel.col_pol'),
          align: 'right',
          cellClassName: 'font-medium text-green-400',
          render: (row) => `+${fmtBlk(row.payoutAmount)}`,
        },
      ]}
      offersContent={
        <div className="p-6 space-y-3">
          <p className="text-sm text-gray-400 text-center">{t('zerads.credits_delay_note')}</p>
          {popupBlocked && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{t('offerwall.offerwallme.popup_blocked_hint')}</span>
            </div>
          )}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs flex items-center justify-between gap-2">
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => void openZerads()}
                className="text-xs text-red-300 underline hover:text-white font-semibold shrink-0"
              >
                {t('offerwall.offerwallme.retry')}
              </button>
            </div>
          )}
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener"
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 transition-colors text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              {t('zerads.start_earning')}
            </a>
          ) : (
            <button
              type="button"
              disabled={opening}
              onClick={() => void openZerads()}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 disabled:opacity-60 text-sm"
            >
              {opening ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t('zerads.start_earning')}
            </button>
          )}
        </div>
      }
    />
  );
}

function OfferwallMePanel({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<OfferwallTab>('stats');
  const { stats, history, histLoading } = useStatsAndHistory('/offerwallme/stats', '/offerwallme/history?page=1');
  const [url, setUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [opening, setOpening] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resolveUrl = async (autoOpen = false): Promise<string | null> => {
    if (url) {
      if (autoOpen) {
        const opened = openPartnerSafe(url);
        if (!opened) {
          setPopupBlocked(true);
          toast.warning(t('offerwall.offerwallme.popup_blocked_hint'));
        }
      }
      return url;
    }
    setLoadingUrl(true);
    if (autoOpen) setOpening(true);
    setPopupBlocked(false);
    setErrorMsg(null);
    try {
      const res = await fetchOfferwallLinkWithPass('offerwallme', '/offerwallme/link');
      if (res.ok) {
        setUrl(res.url);
        if (autoOpen) {
          const opened = openPartnerSafe(res.url);
          if (!opened) {
            setPopupBlocked(true);
            toast.warning(t('offerwall.offerwallme.popup_blocked_hint'));
          }
        }
        return res.url;
      } else {
        if (res.code === 'CAPTCHA_CANCELLED') {
          toast.info(t('offerwall.offerwallme.captcha_cancelled'));
        } else if (res.code === 'NETWORK_ERROR') {
          setErrorMsg(t('offerwall.offerwallme.network_error'));
          toast.error(t('offerwall.offerwallme.network_error'));
        } else {
          const msg = res.message || t('offerwall.offerwallme.load_error');
          setErrorMsg(msg);
          toast.error(msg);
        }
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message || t('offerwall.offerwallme.load_error');
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoadingUrl(false);
      if (autoOpen) setOpening(false);
    }
    return null;
  };

  useEffect(() => {
    if (tab !== 'offers' || url) return;
    let dead = false;
    api
      .get('/offerwallme/link')
      .then((res) => {
        if (!dead && res.data?.url) setUrl(res.data.url as string);
      })
      .catch(() => {
        /* If captcha or error, will resolve on user gesture via resolveUrl */
      });
    return () => {
      dead = true;
    };
  }, [tab, url]);

  return (
    <OfferwallProviderShell
      onBack={onBack}
      title="Offerwall.me"
      tagline={t('offerwall.offerwallme.tagline')}
      accent={OFFERWALL_ACCENTS.violet}
      Icon={LayoutGrid}
      backLabel={t('offerwall.panel.back')}
      tab={tab}
      onTabChange={setTab}
      statsCards={
        stats
          ? [
              { label: t('offerwall.panel.stat_total_usd'), value: fmtUsd(stats.totalUsd) },
              { label: t('offerwall.panel.stat_total_blk'), value: fmtBlk(stats.totalBlk ?? stats.totalPol) },
              { label: t('offerwall.panel.stat_total_offers'), value: String(stats.totalOffers ?? 0) },
            ]
          : null
      }
      periodCards={
        stats
          ? [
              {
                label: t('offerwall.panel.period_today'),
                valueLabel: t('offerwall.panel.period_offers', { count: Number(stats.offersToday || 0) }),
              },
              {
                label: t('offerwall.panel.period_week'),
                valueLabel: t('offerwall.panel.period_offers', { count: Number(stats.offersWeek || 0) }),
              },
              {
                label: t('offerwall.panel.period_month'),
                valueLabel: t('offerwall.panel.period_offers', { count: Number(stats.offersMonth || 0) }),
              },
            ]
          : null
      }
      howItWorks={t('offerwall.offerwallme.description')}
      rateNote={t('offerwall.panel.exchange_rate', { rate: '0.0005' })}
      openOffersLabel={t('offerwall.panel.open_offers')}
      historyTitle={t('offerwall.panel.history_title')}
      historyEmpty={t('offerwall.panel.history_empty')}
      historyRecent={history?.length ? t('offerwall.panel.history_recent', { count: history.length }) : null}
      historyLoading={histLoading}
      historyRows={history}
      historyColumns={usdOfferHistoryCols()}
      banner={
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/8 px-4 py-3 text-xs text-sky-200 leading-relaxed space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-black uppercase tracking-wider text-sky-300 text-[10px]">{t('offerwall.offerwallme.new_flow_title')}</p>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-xs font-semibold border border-sky-500/30 transition-all"
              >
                <ExternalLink className="w-3 h-3" />
                {t('offerwall.offerwallme.open_direct')}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => void resolveUrl(true)}
                disabled={opening || loadingUrl}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-xs font-semibold border border-sky-500/30 transition-all disabled:opacity-50"
              >
                {opening || loadingUrl ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                {t('offerwall.offerwallme.open_direct')}
              </button>
            )}
          </div>
          <p>{t('offerwall.offerwallme.new_flow_body')}</p>
          <p className="text-sky-200/80">{t('offerwall.offerwallme.new_flow_hint')}</p>
        </div>
      }
      offersContent={
        <div className="space-y-4 p-4 sm:p-6">
          <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/40 via-slate-900/60 to-slate-950/80 p-5 space-y-4 shadow-lg shadow-violet-950/20">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  {t('offerwall.offerwallme.recommended_badge')}
                </span>
                <h3 className="text-base font-bold text-white">{t('offerwall.offerwallme.direct_title')}</h3>
              </div>
              <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                {t('offerwall.offerwallme.open_direct_recommended')}
              </p>
            </div>

            {popupBlocked && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>{t('offerwall.offerwallme.popup_blocked_hint')}</span>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs flex items-center justify-between gap-2">
                <span>{errorMsg}</span>
                <button
                  type="button"
                  onClick={() => void resolveUrl(true)}
                  className="text-xs text-red-300 underline hover:text-white font-semibold shrink-0"
                >
                  {t('offerwall.offerwallme.retry')}
                </button>
              </div>
            )}

            {url ? (
              <div className="space-y-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener"
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-bold py-3.5 px-6 shadow-md shadow-violet-600/30 transition-all text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t('offerwall.offerwallme.open_direct')}
                </a>
                <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{t('offerwall.offerwallme.link_ready_hint')}</span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={opening || loadingUrl}
                onClick={() => void resolveUrl(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-bold py-3.5 px-6 shadow-md shadow-violet-600/30 transition-all disabled:opacity-60 text-sm"
              >
                {opening || loadingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                {loadingUrl ? t('offerwall.offerwallme.generating_link') : t('offerwall.offerwallme.open_direct')}
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10 text-xs">
              <span className="text-gray-400 font-medium">
                {t('offerwall.offerwallme.embedded_view_title')}
              </span>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1.5 text-violet-300 hover:text-white font-semibold transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t('offerwall.offerwallme.open_in_new_tab')}
                </a>
              ) : (
                <button
                  type="button"
                  disabled={opening || loadingUrl}
                  onClick={() => void resolveUrl(true)}
                  className="inline-flex items-center gap-1.5 text-violet-300 hover:text-white font-semibold transition-colors disabled:opacity-50"
                >
                  {opening || loadingUrl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                  {t('offerwall.offerwallme.open_in_new_tab')}
                </button>
              )}
            </div>
            {url ? (
              <EmbedFrame title="Offerwall.me" url={url} loading={loadingUrl} />
            ) : (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-gray-400">
                  {t('offerwall.offerwallme.iframe_hint')}
                </p>
                <button
                  type="button"
                  disabled={loadingUrl || opening}
                  onClick={() => void resolveUrl(false)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold border border-white/15 transition-all disabled:opacity-50"
                >
                  {loadingUrl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {t('offerwall.offerwallme.load_embed_button')}
                </button>
              </div>
            )}
          </div>
        </div>
      }
    />
  );
}

function MoneyRainPanel({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<OfferwallTab>('stats');
  const { stats, history, histLoading } = useStatsAndHistory('/moneyrain/stats', '/moneyrain/history?page=1');
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'offers' || url) return;
    let dead = false;
    api
      .get('/moneyrain/link')
      .then((res) => {
        const wall = res.data?.url as string | undefined;
        if (!dead) setUrl(wall ? wall.replace('/wall.php', '/embed.php') : null);
      })
      .catch(() => {
        if (!dead) setUrl(null);
      });
    return () => {
      dead = true;
    };
  }, [tab, url]);

  return (
    <OfferwallProviderShell
      onBack={onBack}
      title={t('moneyrain.title')}
      tagline={t('moneyrain.subtitle')}
      accent={OFFERWALL_ACCENTS.amber}
      Icon={CloudRain}
      backLabel={t('offerwall.panel.back')}
      tab={tab}
      onTabChange={setTab}
      statsCards={
        stats
          ? [
              { label: t('offerwall.panel.stat_total_usd'), value: fmtUsd(stats.totalUsd) },
              { label: t('offerwall.panel.stat_total_blk'), value: fmtBlk(stats.totalBlk ?? stats.totalPol) },
              { label: t('offerwall.panel.stat_total_offers'), value: String(stats.totalOffers ?? 0) },
            ]
          : null
      }
      periodCards={
        stats
          ? [
              {
                label: t('offerwall.panel.period_today'),
                valueLabel: t('offerwall.panel.period_offers', { count: Number(stats.offersToday || 0) }),
              },
              {
                label: t('offerwall.panel.period_week'),
                valueLabel: t('offerwall.panel.period_offers', { count: Number(stats.offersWeek || 0) }),
              },
              {
                label: t('offerwall.panel.period_month'),
                valueLabel: t('offerwall.panel.period_offers', { count: Number(stats.offersMonth || 0) }),
              },
            ]
          : null
      }
      howItWorks={t('moneyrain.how_it_works_body')}
      rateNote={t('offerwall.panel.exchange_rate', { rate: '0.0005' })}
      openOffersLabel={t('offerwall.panel.open_offers')}
      historyTitle={t('offerwall.panel.history_title')}
      historyEmpty={t('offerwall.panel.history_empty')}
      historyRecent={history?.length ? t('offerwall.panel.history_recent', { count: history.length }) : null}
      historyLoading={histLoading}
      historyRows={history}
      historyColumns={usdOfferHistoryCols()}
      offersContent={<EmbedFrame title="MoneyRain" url={url} />}
    />
  );
}

function MultiwallPanel({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<OfferwallTab>('stats');
  const { stats, history, histLoading } = useStatsAndHistory('/multiwall/stats', '/multiwall/history?page=1');
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'offers' || url) return;
    let dead = false;
    api
      .get('/multiwall/embed')
      .then((res) => {
        if (!dead) setUrl((res.data?.url as string | undefined) ?? null);
      })
      .catch(() => {
        if (!dead) setUrl(null);
      });
    return () => {
      dead = true;
    };
  }, [tab, url]);

  return (
    <OfferwallProviderShell
      onBack={onBack}
      title="Multiwall Ads"
      tagline={t('offerwall.multiwall.tagline')}
      accent={OFFERWALL_ACCENTS.cyan}
      Icon={LayoutGrid}
      backLabel={t('offerwall.panel.back')}
      tab={tab}
      onTabChange={setTab}
      statsCards={
        stats
          ? [
              { label: t('offerwall.panel.stat_total_usd'), value: fmtUsd(stats.totalUsd) },
              { label: t('offerwall.panel.stat_total_blk'), value: fmtBlk(stats.totalBlk ?? stats.totalPol) },
              { label: t('offerwall.panel.stat_total_offers'), value: String(stats.totalOffers ?? 0) },
            ]
          : null
      }
      periodCards={
        stats
          ? [
              {
                label: t('offerwall.panel.period_today'),
                valueLabel: t('offerwall.panel.period_offers', { count: Number(stats.offersToday || 0) }),
              },
              {
                label: t('offerwall.panel.period_week'),
                valueLabel: t('offerwall.panel.period_offers', { count: Number(stats.offersWeek || 0) }),
              },
              {
                label: t('offerwall.panel.period_month'),
                valueLabel: t('offerwall.panel.period_offers', { count: Number(stats.offersMonth || 0) }),
              },
            ]
          : null
      }
      howItWorks={t('offerwall.multiwall.how_it_works_body')}
      rateNote={t('offerwall.panel.exchange_rate', {
        rate: Number(stats?.blkPerClick ?? 0.0005).toFixed(4),
      })}
      openOffersLabel={t('offerwall.panel.open_offers')}
      historyTitle={t('offerwall.panel.history_title')}
      historyEmpty={t('offerwall.panel.history_empty')}
      historyRecent={history?.length ? t('offerwall.panel.history_recent', { count: history.length }) : null}
      historyLoading={histLoading}
      historyRows={history}
      historyColumns={usdOfferHistoryCols()}
      offersContent={<EmbedFrame title="Multiwall Ads" url={url} />}
    />
  );
}

function OfferwallGgPanel({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<OfferwallTab>('stats');
  const { stats, history, histLoading } = useStatsAndHistory('/offerwallgg/stats', '/offerwallgg/history?page=1');
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'offers' || url) return;
    let dead = false;
    api
      .get('/offerwallgg/embed')
      .then((res) => {
        if (!dead) setUrl((res.data?.url as string | undefined) ?? null);
      })
      .catch(() => {
        if (!dead) setUrl(null);
      });
    return () => {
      dead = true;
    };
  }, [tab, url]);

  return (
    <OfferwallProviderShell
      onBack={onBack}
      title="Offerwall.GG"
      tagline={t('offerwall.offerwallgg.tagline')}
      accent={OFFERWALL_ACCENTS.emerald}
      Icon={LayoutGrid}
      backLabel={t('offerwall.panel.back')}
      tab={tab}
      onTabChange={setTab}
      statsCards={
        stats
          ? [
              { label: t('offerwall.panel.stat_total_usd'), value: fmtUsd(stats.totalUsd) },
              { label: t('offerwall.panel.stat_total_blk'), value: fmtBlk(stats.totalBlk ?? stats.totalPol) },
              { label: t('offerwall.panel.stat_total_offers'), value: String(stats.totalOffers ?? 0) },
            ]
          : null
      }
      periodCards={
        stats
          ? [
              {
                label: t('offerwall.panel.period_today'),
                valueLabel: t('offerwall.panel.period_offers', { count: Number(stats.offersToday || 0) }),
              },
              {
                label: t('offerwall.panel.period_week'),
                valueLabel: t('offerwall.panel.period_offers', { count: Number(stats.offersWeek || 0) }),
              },
              {
                label: t('offerwall.panel.period_month'),
                valueLabel: t('offerwall.panel.period_offers', { count: Number(stats.offersMonth || 0) }),
              },
            ]
          : null
      }
      howItWorks={t('offerwall.providers.offerwallgg_desc')}
      rateNote={t('offerwall.panel.exchange_rate', { rate: '0.0005' })}
      openOffersLabel={t('offerwall.panel.open_offers')}
      historyTitle={t('offerwall.panel.history_title')}
      historyEmpty={t('offerwall.panel.history_empty')}
      historyRecent={history?.length ? t('offerwall.panel.history_recent', { count: history.length }) : null}
      historyLoading={histLoading}
      historyRows={history}
      historyColumns={usdOfferHistoryCols()}
      offersContent={<EmbedFrame title="Offerwall.GG" url={url} />}
    />
  );
}
