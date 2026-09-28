import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import {
  BarChart2,
  Calendar,
  Layers,
  LayoutGrid,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { api } from '../../../shared/auth/auth.store';

type DailyRow = {
  day: string;
  dayBrt: string;
  internal: number;
  internalPol: number;
  offerwallMe: number;
  offerwallMePol: number;
  multiwall?: number;
  multiwallPol?: number;
  offerwallGg?: number;
  offerwallGgPol?: number;
  zeradsCallbacks: number;
  zeradsClicks: number;
  zeradsPol: number;
};

type ProviderTotal = { count: number; pol: number };
type ZeradsTotal = { callbacks: number; clicks: number; pol: number };

type AnalyticsTotals = {
  internal?: ProviderTotal;
  offerwallMe?: ProviderTotal;
  multiwall?: ProviderTotal;
  offerwallGg?: ProviderTotal;
  zerads?: ZeradsTotal;
};

export default function AdminOfferwallAnalytics() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 16);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 16));
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
      };
      if (userId.trim()) params.userId = userId.trim();
      const res = await api.get('/admin/offerwall/analytics', { params });
      if (res.data?.ok) {
        setData(res.data);
      } else {
        toast.error(res.data?.message || 'Erro ao carregar analytics de offerwall.');
      }
    } catch {
      toast.error('Erro ao carregar analytics de offerwall.');
    } finally {
      setLoading(false);
    }
  }, [from, to, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  function setPresetDays(days: number) {
    const now = new Date();
    const past = new Date();
    past.setDate(now.getDate() - (days - 1));
    past.setHours(0, 0, 0, 0);
    setFrom(past.toISOString().slice(0, 16));
    setTo(now.toISOString().slice(0, 16));
  }

  const totals = data?.totals as AnalyticsTotals | undefined;
  const daily = (data?.daily as DailyRow[] | undefined) ?? [];
  const scoringConfig = data?.scoringConfig as
    | { zeradsMaxPerWindow?: number; zeradsMaxPerUtcDay?: number }
    | undefined;

  const totalAllPol =
    Number(totals?.internal?.pol ?? 0) +
    Number(totals?.offerwallMe?.pol ?? 0) +
    Number(totals?.multiwall?.pol ?? 0) +
    Number(totals?.offerwallGg?.pol ?? 0) +
    Number(totals?.zerads?.pol ?? 0);

  const totalCompletions =
    Number(totals?.internal?.count ?? 0) +
    Number(totals?.offerwallMe?.count ?? 0) +
    Number(totals?.multiwall?.count ?? 0) +
    Number(totals?.offerwallGg?.count ?? 0) +
    Number(totals?.zerads?.callbacks ?? 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-violet-500/10 p-3 text-violet-400 border border-violet-500/20">
            <BarChart2 className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Offerwall Analytics</h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Servidor UTC: {String(data?.serverNow ?? '—')} · BRT: {String(data?.serverNowBrt ?? '—')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400">Total Distribuído:</span>
          <span className="text-sm font-black font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-xl">
            {totalAllPol.toFixed(4)} POL
          </span>
          <span className="text-xs text-slate-500">({totalCompletions.toLocaleString()} eventos)</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl border border-white/8 bg-slate-900/60 p-4 space-y-3 shadow-xl">
        <div className="flex flex-wrap gap-2 pb-2 border-b border-white/5">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1 mr-2">
            <Calendar className="h-3 w-3" /> Período Rápido:
          </span>
          <button
            type="button"
            onClick={() => setPresetDays(1)}
            className="px-2.5 py-1 text-xs font-bold rounded-lg border border-white/10 bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setPresetDays(7)}
            className="px-2.5 py-1 text-xs font-bold rounded-lg border border-white/10 bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Últimos 7 dias
          </button>
          <button
            type="button"
            onClick={() => setPresetDays(30)}
            className="px-2.5 py-1 text-xs font-bold rounded-lg border border-white/10 bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Últimos 30 dias
          </button>
          <button
            type="button"
            onClick={() => setPresetDays(90)}
            className="px-2.5 py-1 text-xs font-bold rounded-lg border border-white/10 bg-slate-950 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Últimos 90 dias
          </button>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <label className="text-xs text-slate-400 font-bold">
            De:
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="block mt-1 rounded-xl bg-slate-950 border border-white/10 px-3 py-2 text-sm text-white font-mono focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="text-xs text-slate-400 font-bold">
            Até:
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="block mt-1 rounded-xl bg-slate-950 border border-white/10 px-3 py-2 text-sm text-white font-mono focus:border-violet-500 focus:outline-none"
            />
          </label>
          <label className="text-xs text-slate-400 font-bold">
            User ID:
            <div className="flex mt-1 items-center gap-1.5 rounded-xl bg-slate-950 border border-white/10 px-3 py-2 focus-within:border-violet-500">
              <Search className="h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value.replace(/\D/g, ''))}
                placeholder="Todos"
                className="bg-transparent text-sm text-white font-mono w-24 focus:outline-none"
              />
            </div>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 px-5 py-2.5 text-sm font-black uppercase tracking-wider text-white disabled:opacity-60 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {totals && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Internal Offers */}
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase font-black text-sky-400 tracking-widest flex items-center gap-1.5">
                <LayoutGrid className="h-3.5 w-3.5" /> Internas
              </p>
              <span className="text-[9px] bg-sky-500/20 text-sky-300 font-bold px-2 py-0.5 rounded-full">PTC / Tasks</span>
            </div>
            <p className="text-3xl font-black text-white font-mono">{totals.internal?.count ?? 0}</p>
            <p className="text-xs font-mono font-bold text-sky-300">
              {Number(totals.internal?.pol ?? 0).toFixed(4)} POL
            </p>
          </div>

          {/* OfferwallMe */}
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase font-black text-amber-400 tracking-widest flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" /> OfferwallMe
              </p>
              <span className="text-[9px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full">S2S Postback</span>
            </div>
            <p className="text-3xl font-black text-white font-mono">{totals.offerwallMe?.count ?? 0}</p>
            <p className="text-xs font-mono font-bold text-amber-300">
              {Number(totals.offerwallMe?.pol ?? 0).toFixed(4)} POL
            </p>
          </div>

          {/* Multiwall (Offerwall PRO) */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase font-black text-emerald-400 tracking-widest flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Multiwall
              </p>
              <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full">Offerwall PRO</span>
            </div>
            <p className="text-3xl font-black text-white font-mono">{totals.multiwall?.count ?? 0}</p>
            <p className="text-xs font-mono font-bold text-emerald-300">
              {Number(totals.multiwall?.pol ?? 0).toFixed(4)} POL
            </p>
          </div>

          {/* Zerads PTC */}
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase font-black text-violet-400 tracking-widest flex items-center gap-1.5">
                <MousePointerClick className="h-3.5 w-3.5" /> Zerads PTC
              </p>
              <span className="text-[9px] bg-violet-500/20 text-violet-300 font-bold px-2 py-0.5 rounded-full">Traffic PTC</span>
            </div>
            <p className="text-3xl font-black text-white font-mono">{totals.zerads?.callbacks ?? 0} cb</p>
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>{totals.zerads?.clicks ?? 0} cliques</span>
              <span className="text-violet-300 font-bold">{Number(totals.zerads?.pol ?? 0).toFixed(4)} POL</span>
            </div>
            <p className="text-[10px] text-violet-400 font-medium">
              Limite torneio: {scoringConfig?.zeradsMaxPerUtcDay ?? scoringConfig?.zeradsMaxPerWindow ?? 100} cl/dia UTC
            </p>
          </div>
        </div>
      )}

      {/* Daily Breakdown Table */}
      {daily.length > 0 ? (
        <div className="rounded-2xl border border-white/8 bg-slate-900/60 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-white/8 bg-slate-950/60 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-white">Detalhamento Diário</h2>
            <span className="text-xs font-mono text-slate-400">{daily.length} dia(s) listados</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-950/80 text-slate-400 text-[10px] uppercase font-black tracking-wider border-b border-white/5">
                <tr>
                  <th className="px-4 py-3 text-left">Dia (UTC)</th>
                  <th className="px-4 py-3 text-left">Data BRT</th>
                  <th className="px-4 py-3 text-right">Internas</th>
                  <th className="px-4 py-3 text-right">OfferwallMe</th>
                  <th className="px-4 py-3 text-right">Multiwall</th>
                  <th className="px-4 py-3 text-right">Zerads cb</th>
                  <th className="px-4 py-3 text-right">Zerads Cliques</th>
                  <th className="px-4 py-3 text-right text-emerald-400">Total POL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {daily.map((row) => {
                  const dayTotalPol =
                    row.internalPol +
                    row.offerwallMePol +
                    (row.multiwallPol ?? 0) +
                    (row.offerwallGgPol ?? 0) +
                    row.zeradsPol;

                  return (
                    <tr key={row.day} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-white font-bold">{row.day}</td>
                      <td className="px-4 py-3 text-slate-300 font-sans">{row.dayBrt || '—'}</td>
                      <td className="px-4 py-3 text-right text-sky-300">
                        {row.internal} <span className="text-[10px] text-slate-500">({row.internalPol.toFixed(4)})</span>
                      </td>
                      <td className="px-4 py-3 text-right text-amber-300">
                        {row.offerwallMe} <span className="text-[10px] text-slate-500">({row.offerwallMePol.toFixed(4)})</span>
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-300">
                        {row.multiwall ?? 0} <span className="text-[10px] text-slate-500">({(row.multiwallPol ?? 0).toFixed(4)})</span>
                      </td>
                      <td className="px-4 py-3 text-right text-violet-300">{row.zeradsCallbacks}</td>
                      <td className="px-4 py-3 text-right text-slate-400">{row.zeradsClicks}</td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-bold">
                        {dayTotalPol.toFixed(4)} POL
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/8 bg-slate-900/40 p-12 text-center text-slate-500 font-bold uppercase tracking-wider text-xs">
          Nenhuma conversão de offerwall encontrada no período selecionado.
        </div>
      )}
    </div>
  );
}
