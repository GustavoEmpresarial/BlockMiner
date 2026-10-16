import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Gift, Layers, MousePointerClick, Scale, ShieldCheck, Timer } from 'lucide-react';
import type {
  OfferwallBreakdown,
  OfferwallRules,
  OfferwallSourceKey,
} from '../lib/tournaments.types';
import { formatUtcDateTime } from '../../../shared/utils/utcTime';

const SOURCE_LABEL: Record<OfferwallSourceKey, string> = {
  internal: 'Offerwall interna',
  offerwallMe: 'Offerwall.me',
  moneyRain: 'MoneyRain',
  multiwall: 'Multiwall Ads',
  offerwallGg: 'Offerwall.GG',
  zerads: 'Zerads PTC',
};

const SOURCE_LINK: Record<OfferwallSourceKey, string> = {
  internal: '/internal-offerwall',
  offerwallMe: '/offerwall',
  moneyRain: '/offerwall',
  multiwall: '/offerwall',
  offerwallGg: '/offerwall',
  zerads: '/offerwall',
};

function pointsFor(key: OfferwallSourceKey, b: OfferwallBreakdown | null | undefined): number {
  if (!b) return 0;
  if (key === 'zerads') return b.zeradsCredited;
  return b[key];
}

export function OfferwallScoringPanel({
  rules,
  breakdown,
  loggedIn,
}: {
  rules: OfferwallRules;
  breakdown: OfferwallBreakdown | null | undefined;
  loggedIn: boolean;
}) {
  const { t } = useTranslation();
  const total = breakdown?.total ?? 0;
  const zeradsOverCap = breakdown ? Math.max(0, breakdown.zeradsRaw - breakdown.zeradsCredited) : 0;

  return (
    <div className="mt-3 rounded-2xl border-2 border-orange-500/30 bg-orange-950/20 p-4 max-w-2xl space-y-3 shadow-[2px_2px_0px_#000000]">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] font-black uppercase tracking-wider text-orange-300 flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-amber-400" />
          {t('tournaments.offerwall_scoring.title')}
        </p>
        <span className="text-[10px] text-orange-300 font-mono font-bold bg-orange-500/20 border border-orange-500/30 px-2 py-0.5 rounded-md">
          {t('tournaments.offerwall_scoring.each_point')}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {rules.sources.map((s) => {
          const pts = pointsFor(s.key, breakdown);
          return (
            <Link
              key={s.key}
              to={SOURCE_LINK[s.key]}
              className="flex items-center justify-between gap-3 rounded-xl bg-slate-900/60 border border-white/5 hover:border-orange-500/40 p-2.5 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                {s.rule === 'per_click_daily_cap' ? (
                  <MousePointerClick className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                ) : (
                  <Gift className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-bold text-white text-[11px] leading-tight truncate">{SOURCE_LABEL[s.key]}</p>
                  <p className="text-[9px] text-orange-300/90 font-mono">
                    {t(`tournaments.offerwall_scoring.rule_${s.rule}`, { cap: rules.zeradsMaxPerUtcDay })}
                  </p>
                  {s.scoringFrom ? (
                    <p className="text-[9px] text-slate-400 font-mono">
                      {t('tournaments.offerwall_scoring.counts_from', { date: formatUtcDateTime(s.scoringFrom) })}
                    </p>
                  ) : null}
                </div>
              </div>
              {loggedIn ? (
                <span
                  className={`font-mono font-black text-sm tabular-nums ${pts > 0 ? 'text-white' : 'text-slate-600'}`}
                  aria-label={t('tournaments.offerwall_scoring.your_points_from', { source: SOURCE_LABEL[s.key] })}
                >
                  {pts.toLocaleString()}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {loggedIn ? (
        <div className="flex items-center justify-between gap-2 flex-wrap rounded-xl border border-orange-500/20 bg-slate-950/50 px-3 py-2">
          <span className="text-[11px] font-bold text-orange-200 uppercase tracking-wider">
            {t('tournaments.offerwall_scoring.your_total')}
          </span>
          <span className="font-mono font-black text-white text-base tabular-nums">{total.toLocaleString()}</span>
          {zeradsOverCap > 0 ? (
            <p className="basis-full text-[10px] text-amber-300/90 font-mono">
              {t('tournaments.offerwall_scoring.zerads_over_cap', { count: zeradsOverCap, cap: rules.zeradsMaxPerUtcDay })}
            </p>
          ) : null}
          {breakdown?.reachedAt ? (
            <p className="basis-full text-[10px] text-slate-400 font-mono">
              {t('tournaments.offerwall_scoring.reached_at', { date: formatUtcDateTime(breakdown.reachedAt) })}
            </p>
          ) : null}
        </div>
      ) : null}

      <ul className="space-y-1.5 text-[10px] text-orange-100/80 leading-relaxed">
        <li className="flex gap-1.5">
          <Scale className="h-3 w-3 text-orange-400 shrink-0 mt-0.5" />
          {t('tournaments.offerwall_scoring.rule_tie')}
        </li>
        <li className="flex gap-1.5">
          <ShieldCheck className="h-3 w-3 text-orange-400 shrink-0 mt-0.5" />
          {t('tournaments.offerwall_scoring.rule_credit_only')}
        </li>
        <li className="flex gap-1.5">
          <Timer className="h-3 w-3 text-orange-400 shrink-0 mt-0.5" />
          {t('tournaments.offerwall_scoring.rule_window')}
        </li>
      </ul>
    </div>
  );
}
