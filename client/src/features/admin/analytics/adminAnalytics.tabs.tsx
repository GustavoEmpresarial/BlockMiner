import {
  Activity,
  ArrowDownLeft,
  Award,
  BarChart2,
  Calendar,
  Clock,
  Flame,
  RefreshCw,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import {
  DualBarChart,
  ForecastCard,
  MiniBarChart,
  StatCard,
  fmtDuration,
  fmtPol,
  fmtUsd,
  fmtUsdLong,
} from './adminAnalytics.shared';
import type {
  AnalyticsForecast,
  AnalyticsSummary,
  AnalyticsUserRef,
  ChartPoint,
  DistributionResponse,
  InflationResponse,
  PeriodKey,
  ProjectionsResponse,
  TopEarnerRow,
  UserRecentBlockRow,
  WalletActivityPayload,
  WithdrawalsResponse,
} from './adminAnalytics.shared';

export function OverviewTab(props: {
  isLoading: boolean; summary?: AnalyticsSummary; forecast?: AnalyticsForecast;
  chartData?: ChartPoint[]; userRecentBlocks?: UserRecentBlockRow[];
  polPrice: number; period: PeriodKey; periodLabel: string; selectedUser: AnalyticsUserRef | null;
}) {
  const { isLoading, summary, forecast, chartData, userRecentBlocks, polPrice, period, periodLabel, selectedUser } = props;
  return (
    <>
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total distribuido" icon={TrendingUp} color="amber"
            polValue={fmtPol(summary?.totalDistributed)} usdValue={fmtUsd(summary?.totalDistributed, polPrice)} sub="Historico completo" />
          <StatCard label={`Distribuido (${periodLabel})`} icon={BarChart2} color="emerald"
            polValue={fmtPol(summary?.periodDistributed)} usdValue={fmtUsd(summary?.periodDistributed, polPrice)} sub={`Ultimos ${periodLabel}`} />
          <StatCard label="Total saques" icon={ArrowDownLeft} color="violet"
            polValue={fmtPol(summary?.totalWithdrawals)} usdValue={fmtUsd(summary?.totalWithdrawals, polPrice)} sub="Saques completados" />
          {!selectedUser ? (
            <StatCard label={`Usuarios ativos (${periodLabel})`} icon={Users} color="blue"
              polValue={`${summary?.activeUsers ?? "--"} usuários`} usdValue={null}
              sub={`${summary?.blockCount ?? "--"} blocos - ${summary?.totalBlocksEver ?? "--"} total`} />
          ) : (
            <StatCard label={`Saques (${periodLabel})`} icon={ArrowDownLeft} color="blue"
              polValue={fmtPol(summary?.periodWithdrawals)} usdValue={fmtUsd(summary?.periodWithdrawals, polPrice)} sub="No periodo" />
          )}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-start gap-3 mb-5">
          <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-black text-white uppercase tracking-widest">
              Previsao de Rendimento
              {selectedUser ? ` -- ${selectedUser.username || selectedUser.email}` : " -- Rede Total"}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {selectedUser
                ? `${Number(forecast?.userHashRate || 0).toFixed(2)} H/s - ${Number(forecast?.sharePercent || 0).toFixed(3)}% da rede`
                : `${Number(summary?.networkHashRate || 0).toFixed(2)} H/s total`}
              - 0.30 POL/bloco - bloco a cada 10 min
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ForecastCard label="Por dia" pol={`${Number(forecast?.day?.pol || 0).toFixed(6)} POL`} usdVal={fmtUsdLong(forecast?.day?.pol, polPrice)} />
          <ForecastCard label="Por semana" pol={`${Number(forecast?.week?.pol || 0).toFixed(6)} POL`} usdVal={fmtUsdLong(forecast?.week?.pol, polPrice)} />
          <ForecastCard label="Por mes" pol={`${Number(forecast?.month?.pol || 0).toFixed(4)} POL`} usdVal={fmtUsdLong(forecast?.month?.pol, polPrice)} highlight />
          <ForecastCard label="Por ano" pol={`${Number(forecast?.year?.pol || 0).toFixed(2)} POL`} usdVal={fmtUsd(forecast?.year?.pol, polPrice)} />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs font-black text-white uppercase tracking-widest">Distribuicao de Recompensas</p>
            <p className="text-[10px] text-slate-500 mt-0.5">POL distribuido por {period === "year" ? "mes" : "dia"} -- ultimos {periodLabel}</p>
          </div>
          <Calendar className="w-4 h-4 text-slate-600" />
        </div>
        <MiniBarChart data={chartData || []} polPrice={polPrice} />
        {chartData && chartData.length > 0 ? (
          <div className="flex justify-between mt-2">
            <span className="text-[9px] text-slate-600 font-mono">{chartData[0]?.label}</span>
            <span className="text-[9px] text-slate-600 font-mono">{chartData[chartData.length - 1]?.label}</span>
          </div>
        ) : null}
      </div>

      {selectedUser && userRecentBlocks && userRecentBlocks.length > 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            Últimos 50 blocos -- {selectedUser.username || selectedUser.email}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[10px]">
              <thead>
                <tr className="text-slate-600 font-black uppercase tracking-tighter">
                  <th className="pb-3 px-2">Bloco</th>
                  <th className="pb-3 px-2">Recompensa POL</th>
                  <th className="pb-3 px-2">Valor USD</th>
                  <th className="pb-3 px-2">%</th>
                  <th className="pb-3 px-2 text-right">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {userRecentBlocks.map((r) => (
                  <tr key={String(r.id)} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2 px-2 font-mono text-slate-400">#{r.block?.blockNumber ?? r.blockId}</td>
                    <td className="py-2 px-2 font-black text-amber-400">{Number(r.rewardAmount).toFixed(8)}</td>
                    <td className="py-2 px-2 text-slate-400">{polPrice > 0 ? `$${(Number(r.rewardAmount) * polPrice).toFixed(6)}` : "--"}</td>
                    <td className="py-2 px-2 text-slate-400">{Number(r.percentage).toFixed(2)}%</td>
                    <td className="py-2 px-2 text-right text-slate-600">
                      {new Date(r.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ---------- Top Users Tab ----------
export function TopUsersTab({ topEarners, polPrice, isLoading }: {
  topEarners?: TopEarnerRow[]; polPrice: number; isLoading: boolean;
}) {
  if (isLoading) return <div className="h-64 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <p className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
        <Award className="w-4 h-4 text-amber-500" /> Top Ganhadores (histórico)
      </p>
      {!topEarners || topEarners.length === 0 ? (
        <p className="text-slate-600 text-xs text-center py-8">Sem dados de mineração</p>
      ) : (
        <div className="space-y-1.5">
          {topEarners.map((e, i) => (
            <div key={e.userId} className="flex items-center justify-between p-3 bg-slate-800/40 hover:bg-slate-800 rounded-xl transition-colors">
              <div className="flex items-center gap-3">
                <span className={`text-[10px] font-black w-6 text-center ${
                    i === 0 ? "text-amber-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-orange-600" : "text-slate-600"
                  }`}>#{i + 1}</span>
                <div>
                  <p className="text-white text-xs font-bold">{e.username}</p>
                  <p className="text-slate-500 text-[9px]">ID #{e.userId}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-amber-400 font-black text-xs">{Number(e.total).toFixed(4)} POL</p>
                {polPrice > 0 ? <p className="text-slate-500 text-[9px]">${(Number(e.total) * polPrice).toFixed(2)}</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Financial Flow Tab (Deposits + Withdrawals + Inflation combined) ----------
export function FinancialFlowTab(props: {
  depositData: WalletActivityPayload | null;
  depositLoading: boolean;
  onRefreshDeposits: () => void;
  withdrawals: WithdrawalsResponse | null;
  inflation: InflationResponse | null;
  polPrice: number;
  isLoading: boolean;
  periodLabel: string;
}) {
  const { depositData, depositLoading, onRefreshDeposits, withdrawals, inflation, polPrice, isLoading, periodLabel } = props;
  return (
    <div className="space-y-12">
      <section className="space-y-6">
        <div className="flex items-center gap-3 pb-3 border-b border-emerald-500/20">
          <div className="w-1 h-6 bg-emerald-500 rounded-full" />
          <h3 className="text-sm font-black uppercase tracking-widest text-white">Depósitos on-chain</h3>
        </div>
        <div className="space-y-6">
          <DepositsTab data={depositData} loading={depositLoading} onRefresh={onRefreshDeposits} polPrice={polPrice} />
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3 pb-3 border-b border-violet-500/20">
          <div className="w-1 h-6 bg-violet-500 rounded-full" />
          <h3 className="text-sm font-black uppercase tracking-widest text-white">Saques</h3>
        </div>
        <div className="space-y-6">
          <WithdrawalsTab data={withdrawals} polPrice={polPrice} isLoading={isLoading} periodLabel={periodLabel} />
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-3 pb-3 border-b border-amber-500/20">
          <div className="w-1 h-6 bg-amber-500 rounded-full" />
          <h3 className="text-sm font-black uppercase tracking-widest text-white">Inflação e suprimento</h3>
        </div>
        <div className="space-y-6">
          <InflationTab data={inflation} polPrice={polPrice} isLoading={isLoading} />
        </div>
      </section>
    </div>
  );
}

// ---------- Reward Sources Tab (renamed from DistributionTab wrapper) ----------
export function RewardSourcesTab(props: { data: DistributionResponse | null; polPrice: number; isLoading: boolean; periodLabel: string }) {
  return <DistributionTab {...props} />;
}

// ---------- Inflation Tab ----------
export function InflationTab({ data, polPrice, isLoading }: { data: InflationResponse | null; polPrice: number; isLoading: boolean }) {
  if (isLoading || !data) return <div className="h-64 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />;
  const dual = data.series.map(s => ({ label: s.label, up: s.distributed, down: s.withdrawn }));
  const cumulative = data.series.map(s => ({ label: s.label, value: s.cumulative }));
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Supply circulante (net)" icon={TrendingUp} color="amber"
          polValue={fmtPol(data.totals.circulatingNet, 2)} usdValue={fmtUsd(data.totals.circulatingNet, polPrice)} sub="Distribuído − sacado" />
        <StatCard label="Taxa de inflação líquida" icon={Flame} color="rose"
          polValue={`${data.totals.netInflationRatePercent.toFixed(2)}%`} usdValue={null} sub="(emitido − sacado) / emitido" />
        <StatCard label="Média diária emitida" icon={BarChart2} color="emerald"
          polValue={fmtPol(data.totals.avgDailyDistributed, 4)} usdValue={fmtUsd(data.totals.avgDailyDistributed, polPrice)} sub="Média do período" />
        <StatCard label="Média diária sacada" icon={ArrowDownLeft} color="violet"
          polValue={fmtPol(data.totals.avgDailyWithdrawn, 4)} usdValue={fmtUsd(data.totals.avgDailyWithdrawn, polPrice)} sub="Média do período" />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <p className="text-xs font-black text-white uppercase tracking-widest mb-4">Emissão vs Saques (por bucket)</p>
        <DualBarChart data={dual} polPrice={polPrice} />
        <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-500/70 inline-block" /> Distribuído</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-rose-500/70 inline-block" /> Sacado</span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <p className="text-xs font-black text-white uppercase tracking-widest mb-4">Curva de supply líquida (cumulativa)</p>
        <MiniBarChart data={cumulative} polPrice={polPrice} />
      </div>
    </>
  );
}

// ---------- Projections Tab ----------
export function ProjectionsTab({ data, polPrice, isLoading, selectedUser }: { data: ProjectionsResponse | null; polPrice: number; isLoading: boolean; selectedUser: AnalyticsUserRef | null }) {
  if (isLoading || !data) return <div className="h-64 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />;
  return (
    <>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <p className="text-xs font-black text-white uppercase tracking-widest mb-2">
          Projeções {selectedUser ? `-- ${selectedUser.username || selectedUser.email}` : "-- Rede Total"}
        </p>
        <p className="text-[10px] text-slate-500 mb-5">
          {data.assumptions.blocksPerDay} blocos/dia × {data.assumptions.blockRewardPol} POL/bloco
          {data.sharePercent != null ? ` × ${data.sharePercent.toFixed(3)}% (share do usuário)` : ""}
          {" · "}{Number(data.networkHashRate).toFixed(2)} H/s rede
          {data.userHashRate != null ? ` · ${Number(data.userHashRate).toFixed(2)} H/s usuário` : ""}
        </p>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Teórica (hashrate atual)</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <ForecastCard label="1 dia" pol={fmtPol(data.theoretical.day1, 4)} usdVal={fmtUsd(data.theoretical.day1, polPrice)} />
          <ForecastCard label="7 dias" pol={fmtPol(data.theoretical.day7, 4)} usdVal={fmtUsd(data.theoretical.day7, polPrice)} />
          <ForecastCard label="30 dias" pol={fmtPol(data.theoretical.day30, 2)} usdVal={fmtUsd(data.theoretical.day30, polPrice)} highlight />
          <ForecastCard label="90 dias" pol={fmtPol(data.theoretical.day90, 2)} usdVal={fmtUsd(data.theoretical.day90, polPrice)} />
          <ForecastCard label="365 dias" pol={fmtPol(data.theoretical.day365, 2)} usdVal={fmtUsd(data.theoretical.day365, polPrice)} />
        </div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Empírica (média real últimos 30 dias)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ForecastCard label="Média diária" pol={fmtPol(data.empirical.avgDailyLast30, 4)} usdVal={fmtUsdLong(data.empirical.avgDailyLast30, polPrice)} />
          <ForecastCard label="7 dias" pol={fmtPol(data.empirical.day7, 4)} usdVal={fmtUsd(data.empirical.day7, polPrice)} />
          <ForecastCard label="30 dias" pol={fmtPol(data.empirical.day30, 2)} usdVal={fmtUsd(data.empirical.day30, polPrice)} highlight />
          <ForecastCard label="90 dias" pol={fmtPol(data.empirical.day90, 2)} usdVal={fmtUsd(data.empirical.day90, polPrice)} />
        </div>
      </div>
    </>
  );
}

// ---------- Withdrawals Tab ----------
export function WithdrawalsTab({ data, polPrice, isLoading, periodLabel }: { data: WithdrawalsResponse | null; polPrice: number; isLoading: boolean; periodLabel: string }) {
  if (isLoading || !data) return <div className="h-64 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />;
  const chartAmount: ChartPoint[] = data.series.map(s => ({ label: s.label, value: s.amount }));
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Saques concluídos (total)" icon={ArrowDownLeft} color="violet"
          polValue={`${data.stats.completedCount} saques`} usdValue={null} sub={`${fmtPol(data.stats.totalAmount, 2)} acumulado`} />
        <StatCard label="Valor médio" icon={BarChart2} color="amber"
          polValue={fmtPol(data.stats.avg, 4)} usdValue={fmtUsd(data.stats.avg, polPrice)} sub="Por saque" />
        <StatCard label="Mediana" icon={TrendingUp} color="emerald"
          polValue={fmtPol(data.stats.median, 4)} usdValue={fmtUsd(data.stats.median, polPrice)} sub="P50" />
        <StatCard label="P90 / P99" icon={Activity} color="cyan"
          polValue={`${fmtPol(data.stats.p90, 4)}`} usdValue={`P99: ${fmtPol(data.stats.p99, 4)}`} sub="Caudas" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Tempo até saque completar</p>
          <p className="text-white text-base font-black">Médio: {fmtDuration(data.stats.avgTimeToCompleteMs)}</p>
          <p className="text-slate-400 text-xs font-bold mt-1">Mediana: {fmtDuration(data.stats.medianTimeToCompleteMs)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:col-span-2">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Status no período ({periodLabel})</p>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div><p className="text-emerald-400 font-black text-base">{data.statusBreakdownPeriod.completed}</p><p className="text-[9px] text-slate-500 uppercase">Completos</p></div>
            <div><p className="text-amber-400 font-black text-base">{data.statusBreakdownPeriod.pending}</p><p className="text-[9px] text-slate-500 uppercase">Pendentes</p></div>
            <div><p className="text-rose-400 font-black text-base">{data.statusBreakdownPeriod.failed}</p><p className="text-[9px] text-slate-500 uppercase">Falhos</p></div>
            <div><p className="text-slate-400 font-black text-base">{data.statusBreakdownPeriod.other}</p><p className="text-[9px] text-slate-500 uppercase">Outros</p></div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <p className="text-xs font-black text-white uppercase tracking-widest mb-4">Saques completos por bucket (POL)</p>
        <MiniBarChart data={chartAmount} polPrice={polPrice} color="violet" />
      </div>
    </>
  );
}

// ---------- Distribution Tab ----------
export function DistributionTab({ data, polPrice, isLoading, periodLabel }: { data: DistributionResponse | null; polPrice: number; isLoading: boolean; periodLabel: string }) {
  if (isLoading || !data) return <div className="h-64 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />;
  const me = data.miningExpected;
  return (
    <>
      {me && (
        <div className="bg-slate-900 border border-amber-800/40 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-4 gap-3">
            <div>
              <p className="text-xs font-black text-white uppercase tracking-widest">Emissão de mineração — Real × Esperado</p>
              <p className="text-[10px] text-slate-500 mt-1">
                No ar há {me.siteAgeDays} dias desde {new Date(me.launchDate).toLocaleDateString("pt-BR")} ·
                Config: {me.rewardBase} POL/bloco · {me.blockDurationMinutes} min/bloco · {me.blocksPerDay} blocos/dia
              </p>
            </div>
            <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${
              me.efficiencyPercent >= 90 ? "bg-emerald-500/20 text-emerald-400" :
              me.efficiencyPercent >= 70 ? "bg-amber-500/20 text-amber-400" :
              "bg-rose-500/20 text-rose-400"
            }`}>{me.efficiencyPercent.toFixed(1)}% eficiência</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-800/40 rounded-xl">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest">Esperado (teto)</p>
              <p className="text-emerald-400 font-black font-mono text-sm">{me.expectedPol.toFixed(4)} POL</p>
              <p className="text-[9px] text-slate-600">{me.expectedBlocks.toLocaleString("pt-BR")} blocos</p>
            </div>
            <div className="p-3 bg-slate-800/40 rounded-xl">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest">Real emitido</p>
              <p className="text-amber-400 font-black font-mono text-sm">{me.actualPol.toFixed(4)} POL</p>
              <p className="text-[9px] text-slate-600">{me.actualBlocks.toLocaleString("pt-BR")} blocos</p>
            </div>
            <div className="p-3 bg-slate-800/40 rounded-xl">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest">POL perdido (downtime)</p>
              <p className="text-rose-400 font-black font-mono text-sm">{me.missingPol.toFixed(4)} POL</p>
              <p className="text-[9px] text-slate-600">{me.missingBlocks.toLocaleString("pt-BR")} blocos</p>
            </div>
            <div className="p-3 bg-slate-800/40 rounded-xl">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest">Equivalente USD</p>
              <p className="text-sky-400 font-black font-mono text-sm">{polPrice > 0 ? `$${(me.actualPol * polPrice).toFixed(2)}` : "—"}</p>
              <p className="text-[9px] text-slate-600">de ${polPrice > 0 ? (me.expectedPol * polPrice).toFixed(2) : "—"} esperado</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <p className="text-xs font-black text-white uppercase tracking-widest mb-1">Distribuição por fonte — {periodLabel}</p>
        <p className="text-[10px] text-slate-500 mb-5">Total entrante (recompensas): {fmtPol(data.totalInflowFromSources, 4)} {fmtUsd(data.totalInflowFromSources, polPrice) ?? ""}</p>
        <div className="space-y-2">
          {data.sources.map(s => (
            <div key={s.key} className="p-3 bg-slate-800/40 hover:bg-slate-800/70 rounded-xl">
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <p className="text-white text-xs font-bold">{s.label}</p>
                  <p className="text-[10px] text-slate-500">{s.count} eventos</p>
                </div>
                <div className="text-right">
                  <p className="text-amber-400 font-black text-xs">{fmtPol(s.pol, 4)}</p>
                  <p className="text-[10px] text-slate-500">{s.sharePercent.toFixed(2)}% {fmtUsd(s.pol, polPrice) ?? ""}</p>
                </div>
              </div>
              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500/70" style={{ width: `${Math.max(1, Math.min(100, s.sharePercent))}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Entrada externa (depósitos)</p>
          <p className="text-emerald-400 font-black text-base">{fmtPol(data.depositsInflow.pol, 4)}</p>
          <p className="text-slate-500 text-[10px]">{data.depositsInflow.count} depósitos · {fmtUsd(data.depositsInflow.pol, polPrice) ?? ""}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Saída externa (saques)</p>
          {data.outflows.map(o => (
            <div key={o.key}>
              <p className="text-rose-400 font-black text-base">{fmtPol(o.pol, 4)}</p>
              <p className="text-slate-500 text-[10px]">{o.count} saques · {fmtUsd(o.pol, polPrice) ?? ""}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}



export function DepositsTab({
  data, loading, onRefresh, polPrice = 0,
}: {
  data: WalletActivityPayload | null;
  loading: boolean;
  onRefresh: () => void;
  polPrice?: number;
}) {
  if (loading && !data) {
    return <div className="py-20 text-center text-slate-500 animate-pulse font-bold uppercase tracking-widest text-sm">Consultando blockchain...</div>;
  }

  const wallets = data?.wallets ?? [];
  const depositWallets = wallets.filter(w => /deposit/i.test(w.label ?? ""));
  const totalDepositIn = depositWallets.reduce((acc, w) => acc + Number(w.summary?.totalInPol || 0), 0);
  const apiUsd = depositWallets.some(w => w.summary?.totalInUsd != null)
    ? depositWallets.reduce((acc, w) => acc + Number(w.summary?.totalInUsd || 0), 0)
    : null;
  const totalDepositInUsd = apiUsd ?? (polPrice > 0 && totalDepositIn > 0 ? totalDepositIn * polPrice : null);

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button type="button" onClick={onRefresh} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-[10px] font-black uppercase text-slate-300">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {depositWallets.length > 0 && (
        <div className="bg-slate-900 border border-emerald-800/40 rounded-3xl p-8 space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Total Depositado (on-chain)</p>
          <p className="text-4xl font-black text-emerald-400 font-mono">{totalDepositIn.toLocaleString("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 8 })} POL</p>
          {totalDepositInUsd != null && <p className="text-base text-slate-400 font-mono">≈ ${totalDepositInUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</p>}
          <p className="text-[10px] text-slate-600 pt-1">{depositWallets.map(w => w.label ?? w.address).join(" + ")}</p>
        </div>
      )}

      {!loading && depositWallets.length === 0 && (
        <div className="py-16 text-center text-slate-500 text-sm">Nenhum dado disponível.</div>
      )}
    </div>
  );
}
