import { useTranslation } from 'react-i18next';
import { Users, Pickaxe, Wallet, ArrowDownLeft, TrendingUp, Activity, AlertCircle, CheckCircle2 } from 'lucide-react';

export type ExecutiveSummary = {
  siteAgeDays: number;
  usersTotal: number;
  newUsersInPeriod: number;
  newUsers24h: number;
  activeMiners: number;
  totalBlocks: number;
  depositsTotal: number;
  periodDeposits: number;
  withdrawnTotal: number;
  withdrawalCount: number;
  balancesPol: number;
  pendingPol: number;
  pendingCount: number;
  retentionPercent: number;
  withdrawalDepositRatioPercent: number;
  internalSpendPol: number;
  avgWithdrawal: number;
  miningEfficiencyPercent: number;
  theoreticalDailyEmission: number;
  empiricalDailyEmission: number;
  deposits24h: number;
  withdrawals24h: number;
};

function fmt(val: number, maxFrac = 2): string {
  return val.toLocaleString('pt-BR', { maximumFractionDigits: maxFrac });
}

function pct(val: number): string {
  return `${fmt(val, 1)}%`;
}

type FlowSegment = { key: string; label: string; value: number; color: string };

function FlowBar({ segments, total }: { segments: FlowSegment[]; total: number }) {
  if (total <= 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-800">
        {segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.key}
              className="h-full transition-all"
              style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
              title={`${s.label}: ${fmt(s.value)} POL`}
            />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span>
              {s.label}: <span className="text-slate-300 font-bold">{fmt(s.value)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = 'text-amber-500',
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${accent}`} />
        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{label}</p>
      </div>
      <p className="text-xl font-black text-white">{value}</p>
      {sub ? <p className="text-[11px] text-slate-500 mt-1">{sub}</p> : null}
    </div>
  );
}

function buildInsights(data: ExecutiveSummary, t: (k: string, opts?: Record<string, unknown>) => string): Array<{ tone: 'ok' | 'warn' | 'info'; text: string }> {
  const out: Array<{ tone: 'ok' | 'warn' | 'info'; text: string }> = [];

  if (data.withdrawalDepositRatioPercent < 25) {
    out.push({ tone: 'ok', text: t('adminAnalytics.insight_low_withdrawal', { pct: pct(data.withdrawalDepositRatioPercent) }) });
  } else if (data.withdrawalDepositRatioPercent > 50) {
    out.push({ tone: 'warn', text: t('adminAnalytics.insight_high_withdrawal', { pct: pct(data.withdrawalDepositRatioPercent) }) });
  }

  if (data.miningEfficiencyPercent < 90) {
    out.push({
      tone: 'warn',
      text: t('adminAnalytics.insight_mining_efficiency', { pct: pct(data.miningEfficiencyPercent) }),
    });
  } else {
    out.push({ tone: 'ok', text: t('adminAnalytics.insight_mining_ok', { pct: pct(data.miningEfficiencyPercent) }) });
  }

  if (data.withdrawals24h === 0 && data.deposits24h > 0) {
    out.push({ tone: 'info', text: t('adminAnalytics.insight_no_withdrawals_24h', { dep: fmt(data.deposits24h) }) });
  }

  if (data.internalSpendPol > 0) {
    out.push({
      tone: 'info',
      text: t('adminAnalytics.insight_internal_spend', { pol: fmt(data.internalSpendPol) }),
    });
  }

  const emissionGap = data.theoreticalDailyEmission > 0
    ? ((data.empiricalDailyEmission / data.theoreticalDailyEmission) * 100)
    : 100;
  if (emissionGap < 85) {
    out.push({ tone: 'warn', text: t('adminAnalytics.insight_emission_gap', { pct: pct(emissionGap) }) });
  }

  return out.slice(0, 5);
}

export function ExecutiveSummaryPanel({ data, polPrice }: { data: ExecutiveSummary; polPrice?: number }) {
  const { t } = useTranslation();

  const flowSegments: FlowSegment[] = [
    { key: 'balances', label: t('adminAnalytics.exec_balances'), value: data.balancesPol, color: '#38bdf8' },
    { key: 'pending', label: t('adminAnalytics.exec_pending'), value: data.pendingPol, color: '#a78bfa' },
    { key: 'withdrawn', label: t('adminAnalytics.exec_withdrawn'), value: data.withdrawnTotal, color: '#f472b6' },
    { key: 'spent', label: t('adminAnalytics.exec_internal_spend'), value: data.internalSpendPol, color: '#64748b' },
  ];
  const accounted = flowSegments.reduce((s, x) => s + x.value, 0);
  const unaccounted = Math.max(0, data.depositsTotal - accounted);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest">{t('adminAnalytics.executive_title')}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">{t('adminAnalytics.executive_hint')}</p>
        </div>
        <p className="text-[11px] text-slate-500">
          {t('adminAnalytics.exec_site_age', { days: fmt(data.siteAgeDays, 0) })}
          {' · '}
          {t('adminAnalytics.exec_block', { n: fmt(data.totalBlocks, 0) })}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Users} label={t('adminAnalytics.exec_users')} value={fmt(data.usersTotal, 0)} sub={`+${data.newUsersInPeriod} ${t('adminAnalytics.exec_in_period')} · +${data.newUsers24h} (24h)`} />
        <KpiCard icon={Pickaxe} label={t('adminAnalytics.exec_miners')} value={fmt(data.activeMiners, 0)} accent="text-sky-400" />
        <KpiCard
          icon={Wallet}
          label={t('adminAnalytics.exec_deposits')}
          value={`${fmt(data.depositsTotal)} POL`}
          sub={polPrice ? `≈ US$ ${fmt(data.depositsTotal * polPrice)}` : `+${fmt(data.periodDeposits)} ${t('adminAnalytics.exec_in_period')}`}
        />
        <KpiCard
          icon={ArrowDownLeft}
          label={t('adminAnalytics.exec_withdrawals')}
          value={`${fmt(data.withdrawnTotal)} POL`}
          sub={`${data.withdrawalCount} ${t('adminAnalytics.exec_withdrawal_count')} · ø ${fmt(data.avgWithdrawal)}`}
        />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-slate-300">{t('adminAnalytics.exec_flow_title')}</p>
          <p className="text-[11px] text-slate-500">
            {t('adminAnalytics.exec_deposits')}: <span className="text-white font-bold">{fmt(data.depositsTotal)} POL</span>
          </p>
        </div>
        <FlowBar segments={flowSegments} total={data.depositsTotal} />
        {unaccounted > 1 ? (
          <p className="text-[10px] text-slate-600 italic">
            {t('adminAnalytics.exec_unaccounted', { pol: fmt(unaccounted) })}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={TrendingUp} label={t('adminAnalytics.exec_retention')} value={pct(data.retentionPercent)} sub={t('adminAnalytics.exec_retention_hint')} accent="text-emerald-400" />
        <KpiCard icon={ArrowDownLeft} label={t('adminAnalytics.exec_wd_ratio')} value={pct(data.withdrawalDepositRatioPercent)} sub={t('adminAnalytics.exec_wd_ratio_hint')} />
        <KpiCard icon={Activity} label={t('adminAnalytics.exec_mining_eff')} value={pct(data.miningEfficiencyPercent)} accent={data.miningEfficiencyPercent >= 90 ? 'text-emerald-400' : 'text-amber-500'} />
        <KpiCard icon={Pickaxe} label={t('adminAnalytics.exec_theo_daily')} value={`${fmt(data.theoreticalDailyEmission)} POL`} sub={t('adminAnalytics.exec_per_day')} />
        <KpiCard icon={Pickaxe} label={t('adminAnalytics.exec_emp_daily')} value={`${fmt(data.empiricalDailyEmission)} POL`} sub={t('adminAnalytics.exec_per_day')} accent="text-violet-400" />
        <KpiCard
          icon={Wallet}
          label={t('adminAnalytics.exec_24h')}
          value={`+${fmt(data.deposits24h)} / -${fmt(data.withdrawals24h)}`}
          sub={t('adminAnalytics.exec_24h_hint')}
        />
      </div>

      {(() => {
        const insights = buildInsights(data, t);
        if (insights.length === 0) return null;
        return (
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('adminAnalytics.insights_title')}</p>
            <ul className="space-y-1.5">
              {insights.map((ins, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-slate-400">
                  {ins.tone === 'ok' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  ) : ins.tone === 'warn' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  ) : (
                    <Activity className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                  )}
                  <span>{ins.text}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}
    </div>
  );
}
