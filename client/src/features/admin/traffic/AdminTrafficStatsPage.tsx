import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../shared/auth/auth.store';

type Summary = {
  totalHits: number;
  periodHits: number;
  totalRegs: number;
  periodRegs: number;
  conversionRate: number | null;
  days: number;
};
type DomainRow = { domain: string; hits: number; registrations: number; conversionRate: number | null };
type UtmRow = { source: string; hits: number; registrations: number; conversionRate: number | null };
type DailyRow = { date: string; hits: number; registrations: number };

type Tab = 'overview' | 'domains' | 'utm';

const DAYS_OPTIONS = [7, 14, 30, 60, 90];

function pct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}
function num(n: number) {
  return n.toLocaleString();
}

function StatCard({
  label,
  value,
  sub,
  color = 'text-white',
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{typeof value === 'number' ? num(value) : value}</p>
      {sub ? <p className="mt-1 text-[10px] text-gray-600">{sub}</p> : null}
    </div>
  );
}

function BarChart({ rows, days }: { rows: DailyRow[]; days: number }) {
  const maxHits = Math.max(...rows.map((r) => r.hits), 1);
  const maxRegs = Math.max(...rows.map((r) => r.registrations), 1);
  const barMax = Math.max(maxHits, maxRegs);
  const show = rows.slice(-days);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        <div className="mb-1 flex h-40 items-end gap-0.5">
          {show.map((r) => (
            <div
              key={r.date}
              className="flex h-full flex-1 items-end gap-px"
              title={`${r.date}: ${r.hits} landing hits, ${r.registrations} cadastros`}
            >
              <div className="flex-1 rounded-t bg-sky-500/40" style={{ height: `${(r.hits / barMax) * 100}%` }} />
              <div
                className="flex-1 rounded-t bg-emerald-500/60"
                style={{ height: `${(r.registrations / barMax) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-4 text-[10px] text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-sky-500/40" />
            Landing hits
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-emerald-500/60" />
            Cadastros
          </span>
        </div>
      </div>
    </div>
  );
}

function TableRows({
  rows,
  keyCol,
  keyLabel,
}: {
  rows: Array<Record<string, unknown>>;
  keyCol: string;
  keyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="px-5 py-8 text-center text-xs text-gray-600">sem dados</p>;
  }
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-gray-800">
          <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500">{keyLabel}</th>
          <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-gray-500">
            Hits
          </th>
          <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-gray-500">
            Cadastros
          </th>
          <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-widest text-gray-500">
            Ratio*
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r[keyCol])} className="border-b border-gray-800/60">
            <td className="px-3 py-2 font-mono text-xs text-slate-300">{String(r[keyCol])}</td>
            <td className="px-3 py-2 text-right text-sky-400">{num(Number(r.hits || 0))}</td>
            <td className="px-3 py-2 text-right text-emerald-400">{num(Number(r.registrations || 0))}</td>
            <td className="px-3 py-2 text-right font-black text-amber-400">
              {pct(r.conversionRate as number | null)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AdminTrafficStatsPage() {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<Tab>('overview');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [utmRows, setUtmRows] = useState<UtmRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d, dom, utm] = await Promise.all([
        api.get<Summary & { ok: boolean }>(`/admin/traffic/summary?days=${days}`),
        api.get<{ ok: boolean; rows: DailyRow[] }>(`/admin/traffic/daily?days=${days}`),
        api.get<{ ok: boolean; rows: DomainRow[] }>(`/admin/traffic/by-domain?days=${days}`),
        api.get<{ ok: boolean; rows: UtmRow[] }>(`/admin/traffic/by-utm?days=${days}`),
      ]);
      setSummary(s.data);
      setDaily(d.data.rows ?? []);
      setDomains(dom.data.rows ?? []);
      setUtmRows(utm.data.rows ?? []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Visão Geral' },
    { id: 'domains', label: 'Por Domínio' },
    { id: 'utm', label: 'Por UTM Source' },
  ];

  const ratioNote =
    summary && summary.periodHits > 0 && summary.periodRegs > summary.periodHits
      ? 'Ratio >100%: cadastros incluem quem não passou pela landing (/). Não é conversão real.'
      : 'Hits = page_views da landing (/). Cadastros = todos os users criados no período.';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight text-white">Estatísticas de Tráfego</h1>
          <p className="mt-0.5 text-xs text-gray-500">Landing hits vs cadastros (métricas diferentes)</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-gray-500">Período</span>
          <div className="flex gap-1">
            {DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-black uppercase transition-colors ${
                  days === d ? 'bg-primary text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-gray-800 px-3 py-1.5 text-[11px] font-black uppercase text-gray-400 hover:bg-gray-700"
          >
            {loading ? '...' : '↻'}
          </button>
        </div>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label={`Landing hits (${days}d)`} value={summary.periodHits} color="text-sky-400" />
          <StatCard label={`Cadastros (${days}d)`} value={summary.periodRegs} color="text-emerald-400" />
          <StatCard
            label="Ratio cadastros/hits"
            value={pct(summary.conversionRate)}
            color="text-amber-400"
            sub="não é conversão de funil"
          />
          <StatCard label="Hits total" value={summary.totalHits} sub="todos os tempos" />
          <StatCard label="Cadastros total" value={summary.totalRegs} sub="todos os tempos" />
        </div>
      ) : null}

      <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-100/80">
        {ratioNote}
      </p>

      <div className="flex gap-1 border-b border-gray-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-[11px] font-black uppercase tracking-wide transition-colors ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-gray-500">
            Landing hits & cadastros — últimos {days} dias
          </p>
          {daily.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-600">sem dados</p>
          ) : (
            <BarChart rows={daily} days={days} />
          )}
        </div>
      ) : null}

      {tab === 'domains' ? (
        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
          <div className="border-b border-gray-800 px-5 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
              Origem por domínio referenciador
            </p>
          </div>
          <TableRows rows={domains as unknown as Array<Record<string, unknown>>} keyCol="domain" keyLabel="Domínio" />
        </div>
      ) : null}

      {tab === 'utm' ? (
        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
          <div className="border-b border-gray-800 px-5 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Origem por utm_source</p>
          </div>
          <TableRows rows={utmRows as unknown as Array<Record<string, unknown>>} keyCol="source" keyLabel="UTM Source" />
        </div>
      ) : null}
    </div>
  );
}
