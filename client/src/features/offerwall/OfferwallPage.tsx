/**
 * External Offerwall hub — Zerads / Offerwall.me / MoneyRain / Multiwall Ads / Offerwall.GG.
 * All providers share the same chrome: Stats tab | Offers tab (iframe or partner open).
 */
import { useEffect, useState, type ComponentType } from 'react';
import {
  Clock,
  Coins,
  LayoutGrid,
  Loader2,
  Wrench,
  MousePointerClick,
  CloudRain,
  type LucideProps,
} from 'lucide-react';
import { api } from '../../shared/auth/auth.store';
import { t } from './lib/offerwall.i18n';
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

declare global {
  interface Window {
    _BmPartnerIframe?: (url: string) => boolean;
  }
}

function openPartner(url: string) {
  if (typeof window._BmPartnerIframe === 'function') {
    window._BmPartnerIframe(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

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
  return (
    <div className={`rounded-2xl border ${accent.border} bg-white/5 overflow-hidden flex flex-col`}>
      <div className={`h-24 ${accent.bg} flex items-center justify-center relative`}>
        <Icon className={`w-10 h-10 ${accent.icon} opacity-80`} />
        {provider.maintenance ? (
          <span className="absolute top-2 right-2 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/25">
            {t('offerwall.panel.maintenance_badge')}
          </span>
        ) : null}
      </div>
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <p className="text-sm font-bold text-white">{provider.name}</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">{provider.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${accent.badge}`}>
            <Coins className="w-3 h-3" />
            {provider.rewardLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-white/5 text-gray-400 border border-white/10">
            <Clock className="w-3 h-3" />
            {provider.creditTime}
          </span>
        </div>
        <button
          type="button"
          onClick={onSelect}
          className={`mt-auto w-full py-2 rounded-xl text-sm font-semibold text-white transition-all ${accent.bg} border ${accent.border} hover:brightness-125`}
        >
          {provider.maintenance ? t('offerwall.panel.maintenance_badge') : t('offerwall.access')}
        </button>
      </div>
    </div>
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

  if (panel === 'zerads') return <ZeradsPanel onBack={() => setPanel(null)} />;
  if (panel === 'offerwallme') return <OfferwallMePanel onBack={() => setPanel(null)} />;
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
          <LayoutGrid className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{t('sidebar.offerwall')}</h1>
          <p className="text-sm text-gray-400">{t('offerwall.subtitle')}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

  const openZerads = async () => {
    setOpening(true);
    try {
      const res = await api.get('/zerads/link');
      const url = res.data?.url as string | undefined;
      if (url) openPartner(url);
    } catch {
      /* ignore */
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
          <button
            type="button"
            disabled={opening}
            onClick={() => void openZerads()}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 disabled:opacity-60"
          >
            {opening ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t('zerads.start_earning')}
          </button>
        </div>
      }
    />
  );
}

function OfferwallMePanel({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<OfferwallTab>('stats');
  const { stats, history, histLoading } = useStatsAndHistory('/offerwallme/stats', '/offerwallme/history?page=1');
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'offers' || url) return;
    let dead = false;
    api
      .get('/offerwallme/embed')
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
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/8 px-4 py-3 text-xs text-sky-200 leading-relaxed space-y-1.5">
          <p className="font-black uppercase tracking-wider text-sky-300 text-[10px]">{t('offerwall.offerwallme.new_flow_title')}</p>
          <p>{t('offerwall.offerwallme.new_flow_body')}</p>
          <p className="text-sky-200/80">{t('offerwall.offerwallme.new_flow_hint')}</p>
        </div>
      }
      offersContent={<EmbedFrame title="Offerwall.me" url={url} />}
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
