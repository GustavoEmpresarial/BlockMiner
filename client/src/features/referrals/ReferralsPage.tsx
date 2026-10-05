import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  UserPlus,
  Users,
  Coins,
  Copy,
  RefreshCw,
  Loader2,
  TrendingUp,
  Link2,
} from 'lucide-react';
import Card from '../../shared/components/Card';
import IconBadge from '../../shared/components/IconBadge';
import SectionHeader from '../../shared/components/SectionHeader';
import KpiCard from '../../shared/components/StatCard';
import {
  buildReferralLink,
  fetchReferralStats,
  formatPolAmount,
  formatShibAmount,
  formatUsdAmount,
  type ReferralStatsPayload,
} from './lib/referrals.api';

function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof UserPlus;
  accent: string;
}) {
  return <KpiCard label={label} value={value} sub={sub} icon={icon} accent={accent} />;
}

export default function ReferralsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [data, setData] = useState<ReferralStatsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchReferralStats();
      if (res.ok) setData(res);
    } catch {
      toast.error(t('referrals.error_load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const referralLink = useMemo(() => {
    if (!data) return '';
    return buildReferralLink(data.referralId, data.refCode);
  }, [data]);

  const copyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success(t('referrals.link_copied'));
    } catch {
      toast.error(t('referrals.copy_failed'));
    }
  };

  const commissionPct = data ? Math.round(data.commissionRate * 100) : 10;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
        <div className="flex items-center gap-3">
          <IconBadge icon={UserPlus} variant="violet" size="lg" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">{t('referrals.title')}</h1>
            <p className="text-slate-400 text-xs sm:text-sm font-medium max-w-2xl">{t('referrals.subtitle', { rate: commissionPct })}</p>
            {data?.statsSince ? (
              <p className="text-xs text-violet-300 font-bold">
                {t('referrals.stats_since', { date: data.statsSince })}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="p-3 bg-slate-900 hover:border-slate-500 text-slate-300 hover:text-white rounded-xl transition-all border-2 border-slate-700 shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary w-fit"
          aria-label={t('referrals.refresh')}
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {data ? (
        <Card className="space-y-3 border-violet-500/30">
          <SectionHeader icon={Link2} iconVariant="violet" title={t('referrals.your_link')} />
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              readOnly
              value={referralLink}
              className="flex-1 min-w-0 rounded-xl border-2 border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 font-mono shadow-[2px_2px_0px_#000000]"
            />
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 active:translate-x-0.5 active:translate-y-0.5 text-slate-950 text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_#000000] transition-all outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <Copy className="w-4 h-4" />
              {t('referrals.copy_link')}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 font-medium">
            {t('referrals.code_label')}: <span className="text-slate-200 font-mono">{data.refCode || data.referralId}</span>
          </p>
        </Card>
      ) : null}

      {loading && !data ? (
        <Card className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
        </Card>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <StatCard
              label={t('referrals.total_referred')}
              value={String(data.summary.totalReferred)}
              sub={t('referrals.joined_since', { count: data.summary.referredJoinedSince })}
              icon={Users}
              accent="text-sky-400"
            />
            <StatCard
              label={t('referrals.total_deposited')}
              value={`${formatPolAmount(data.summary.totalDepositedPol, locale)} POL`}
              sub={[
                data.summary.totalDepositedUsd != null
                  ? formatUsdAmount(data.summary.totalDepositedUsd, locale)
                  : null,
                t('referrals.deposit_count', { count: data.summary.depositCount }),
              ].filter(Boolean).join(' · ')}
              icon={Coins}
              accent="text-violet-400"
            />
            <StatCard
              label={t('referrals.active_in_period')}
              value={String(data.summary.activeInPeriod)}
              sub={t('referrals.earnings_events', { count: data.summary.earningsCount })}
              icon={TrendingUp}
              accent="text-emerald-400"
            />
            <StatCard
              label={t('referrals.earned_pol')}
              value={`${formatPolAmount(data.summary.totalEarningsPol, locale)} POL`}
              icon={Coins}
              accent="text-amber-400"
            />
            <StatCard
              label={t('referrals.earned_shib')}
              value={`${formatShibAmount(data.summary.totalEarningsShib, locale)} SHIB`}
              icon={Coins}
              accent="text-orange-400"
            />
          </div>

          {data.bySource.length > 0 ? (
            <Card variant="table">
              <div className="px-5 sm:px-6 py-4 border-b border-slate-800 bg-slate-950/40">
                <SectionHeader icon={Coins} iconVariant="amber" title={t('referrals.by_source')} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950/90 text-[10px] uppercase tracking-widest text-slate-400 border-b-2 border-slate-800 font-mono">
                    <tr>
                      <th className="px-5 py-3.5">{t('referrals.col_source')}</th>
                      <th className="px-5 py-3.5">{t('referrals.col_pol')}</th>
                      <th className="px-5 py-3.5">{t('referrals.col_shib')}</th>
                      <th className="px-5 py-3.5 text-right">{t('referrals.col_events')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-800/80">
                    {data.bySource.map((row) => (
                      <tr key={row.source} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-white">{row.source}</td>
                        <td className="px-5 py-3.5 text-amber-300 font-mono tabular-nums">{formatPolAmount(row.pol, locale)}</td>
                        <td className="px-5 py-3.5 text-orange-300 font-mono tabular-nums">{formatShibAmount(row.shib, locale)}</td>
                        <td className="px-5 py-3.5 text-right text-slate-300 font-mono tabular-nums">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          <Card variant="table">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between gap-3">
              <SectionHeader icon={Users} iconVariant="sky" title={t('referrals.referred_users')} className="flex-1 border-b-0 pb-0" />
              <span className="text-[10px] font-black text-slate-300 font-mono">{data.referredUsers.length}</span>
            </div>
            {data.referredUsers.length === 0 ? (
              <div className="py-14 text-center text-slate-400 text-sm font-bold">{t('referrals.empty')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-950/90 text-[10px] uppercase tracking-widest text-slate-400 border-b-2 border-slate-800 font-mono">
                    <tr>
                      <th className="px-5 py-3.5">{t('referrals.col_user')}</th>
                      <th className="px-5 py-3.5">{t('referrals.col_joined')}</th>
                      <th className="px-5 py-3.5">{t('referrals.col_deposited')}</th>
                      <th className="px-5 py-3.5">{t('referrals.col_pol')}</th>
                      <th className="px-5 py-3.5">{t('referrals.col_shib')}</th>
                      <th className="px-5 py-3.5 text-right">{t('referrals.col_events')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-800/80">
                    {data.referredUsers.map((row) => (
                      <tr key={row.userId} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-white">{row.username}</td>
                        <td className="px-5 py-3.5 text-slate-300 text-xs font-medium">
                          {new Date(row.joinedAt).toLocaleDateString(locale)}
                        </td>
                        <td className="px-5 py-3.5 text-violet-300 font-mono tabular-nums">
                          <div>{formatPolAmount(row.depositedPol, locale)} POL</div>
                          {row.depositedUsd != null ? (
                            <div className="text-[10px] text-slate-400">{formatUsdAmount(row.depositedUsd, locale)}</div>
                          ) : null}
                          {row.depositCount > 0 ? (
                            <div className="text-[10px] text-slate-400">{t('referrals.deposit_count', { count: row.depositCount })}</div>
                          ) : null}
                        </td>
                        <td className="px-5 py-3.5 text-amber-300 font-mono tabular-nums">{formatPolAmount(row.earningsPol, locale)}</td>
                        <td className="px-5 py-3.5 text-orange-300 font-mono tabular-nums">{formatShibAmount(row.earningsShib, locale)}</td>
                        <td className="px-5 py-3.5 text-right text-slate-300 font-mono tabular-nums">{row.transactionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {data.daily.length > 0 ? (
            <Card variant="table">
              <div className="px-5 sm:px-6 py-4 border-b border-slate-800 bg-slate-950/40">
                <SectionHeader icon={TrendingUp} iconVariant="emerald" title={t('referrals.daily_earnings')} />
              </div>
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left text-sm">
                  <thead className="text-[10px] uppercase tracking-widest text-slate-400 bg-slate-950/90 border-b-2 border-slate-800 font-mono sticky top-0">
                    <tr>
                      <th className="px-5 py-3.5">{t('referrals.col_date')}</th>
                      <th className="px-5 py-3.5">{t('referrals.col_pol')}</th>
                      <th className="px-5 py-3.5">{t('referrals.col_shib')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-800/80">
                    {[...data.daily].reverse().map((row) => (
                      <tr key={row.date} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-3.5 text-slate-200 font-mono">{row.date}</td>
                        <td className="px-5 py-3.5 text-amber-300 font-mono tabular-nums">{formatPolAmount(row.pol, locale)}</td>
                        <td className="px-5 py-3.5 text-orange-300 font-mono tabular-nums">{formatShibAmount(row.shib, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
