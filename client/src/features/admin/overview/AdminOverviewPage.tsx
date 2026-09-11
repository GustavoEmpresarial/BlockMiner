import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Ban,
  CheckCircle2,
  Copy,
  HardDrive,
  MemoryStick,
  RefreshCw,
  Server,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import { api } from '../../../shared/auth/auth.store';
import { ExecutiveSummaryPanel, type ExecutiveSummary } from '../analytics/ExecutiveSummaryPanel';

type DashboardStats = {
  usersTotal?: number;
  usersBanned?: number;
  usersNew24h?: number;
  usersActive7d?: number;
  minersActive?: number;
  minersActiveEngaged?: number;
  balanceTotal?: number;
  tx24h?: number;
  polUsdPrice?: number;
  serverMemoryUsedBytes?: number;
  serverMemoryTotalBytes?: number;
  serverDiskMetricsAvailable?: boolean;
  serverDiskUsedBytes?: number;
  serverDiskTotalBytes?: number;
};

type RecentUser = {
  id: number;
  username?: string | null;
  email?: string | null;
  isBanned?: boolean;
  createdAt?: string;
};

type PendingWithdrawal = {
  id: number;
  amount?: number | string;
  status?: string;
  toAddress?: string | null;
  user?: { id?: number; username?: string | null; email?: string | null } | null;
};

function fmtPol(n: unknown): string {
  return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<RecentUser[]>([]);
  const [pending, setPending] = useState<PendingWithdrawal[]>([]);
  const [executive, setExecutive] = useState<ExecutiveSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [s, u, w, e] = await Promise.all([
        api.get<{ ok?: boolean; stats?: DashboardStats }>('/admin/stats'),
        api.get<{ ok?: boolean; users?: RecentUser[] }>('/admin/users?limit=10'),
        api.get<{ ok?: boolean; withdrawals?: PendingWithdrawal[] }>('/admin/withdrawals/pending'),
        api.get<{ ok?: boolean; executive?: ExecutiveSummary }>('/admin/analytics/executive?period=week'),
      ]);
      if (s.data.ok && s.data.stats) setStats(s.data.stats);
      if (u.data.ok) setUsers(u.data.users ?? []);
      if (w.data.ok) {
        setPending(
          (w.data.withdrawals ?? []).filter((x) => x.status === 'pending' || x.status === 'approved'),
        );
      }
      if (e.data.ok && e.data.executive) setExecutive(e.data.executive);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar dados administrativos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleBan = async (id: number, currentlyBanned: boolean) => {
    try {
      const res = await api.put(`/admin/users/${id}/ban`, { isBanned: !currentlyBanned });
      if (res.data?.ok) {
        toast.success(currentlyBanned ? 'Usuário desbanido!' : 'Usuário banido!');
        await load();
      }
    } catch {
      toast.error('Erro ao atualizar status do usuário.');
    }
  };

  const approve = async (id: number) => {
    if (!window.confirm('Aprovar este saque?')) return;
    try {
      const res = await api.post(`/admin/withdrawals/${id}/approve`);
      if (res.data?.ok) {
        toast.success('Saque aprovado!');
        await load();
      }
    } catch (err) {
      const msg = isAxiosError(err) ? err.response?.data?.message : undefined;
      toast.error(typeof msg === 'string' ? msg : 'Erro ao aprovar saque.');
    }
  };

  const reject = async (id: number) => {
    if (!window.confirm('Rejeitar este saque? O saldo será devolvido ao utilizador.')) return;
    try {
      const res = await api.post(`/admin/withdrawals/${id}/reject`);
      if (res.data?.ok) {
        toast.success('Saque rejeitado.');
        await load();
      }
    } catch (err) {
      const msg = isAxiosError(err) ? err.response?.data?.message : undefined;
      toast.error(typeof msg === 'string' ? msg : 'Erro ao rejeitar.');
    }
  };

  if (loading && !stats) {
    return (
      <div className="py-40 text-center text-sm font-bold uppercase tracking-widest text-slate-400 animate-pulse">
        Carregando painel administrativo...
      </div>
    );
  }

  const memUsed = stats?.serverMemoryUsedBytes ?? 0;
  const memTotal = stats?.serverMemoryTotalBytes ?? 1;
  const diskUsedGb =
    stats?.serverDiskMetricsAvailable && stats.serverDiskTotalBytes != null
      ? ((stats.serverDiskUsedBytes ?? 0) / 1024 ** 3).toFixed(1)
      : null;
  const diskTotalGb =
    stats?.serverDiskMetricsAvailable && stats.serverDiskTotalBytes != null
      ? (stats.serverDiskTotalBytes / 1024 ** 3).toFixed(1)
      : null;

  return (
    <div className="animate-in fade-in space-y-8 duration-700">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">Resumo Geral</h2>
          <p className="text-sm font-medium text-slate-500">Visão em tempo real da saúde da plataforma.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 transition-all hover:bg-slate-700"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Sincronizar Dados
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Users} label="Usuários" value={String(stats?.usersTotal ?? 0)} sub={`+${stats?.usersNew24h ?? 0} / 24h · ${stats?.usersActive7d ?? 0} ativos 7d`} />
        <Kpi icon={Server} label="Mineradoras ativas" value={String(stats?.minersActive ?? 0)} sub={`${stats?.minersActiveEngaged ?? 0} engajadas (login 7d)`} />
        <Kpi icon={Wallet} label="Saldo POL (ativos)" value={fmtPol(stats?.balanceTotal)} sub={stats?.polUsdPrice ? `1 POL ≈ $${Number(stats.polUsdPrice).toFixed(4)}` : 'Tx 24h: ' + String(stats?.tx24h ?? 0)} />
        <Kpi
          icon={MemoryStick}
          label="Servidor"
          value={`${((memUsed / memTotal) * 100).toFixed(0)}% RAM`}
          sub={diskUsedGb && diskTotalGb ? `Disco ${diskUsedGb}/${diskTotalGb} GB` : 'métricas de disco n/d'}
        />
      </div>

      {executive ? <ExecutiveSummaryPanel data={executive} polPrice={stats?.polUsdPrice} /> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-widest text-white">Saques pendentes</h3>
            <Link to="/admin/finance" className="text-[10px] font-bold uppercase text-amber-400 hover:underline">
              Financeiro →
            </Link>
          </div>
          {pending.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Fila limpa.</p>
          ) : (
            <ul className="space-y-2">
              {pending.slice(0, 8).map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white">
                      #{w.id} · {w.user?.username || w.user?.email || 'user'}
                    </p>
                    <p className="font-mono text-[11px] text-amber-400">{fmtPol(w.amount)} POL</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {w.toAddress ? (
                      <button
                        type="button"
                        title="Copiar destino"
                        onClick={() => {
                          void navigator.clipboard.writeText(w.toAddress || '');
                          toast.success('Endereço copiado');
                        }}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    <button type="button" title="Aprovar" onClick={() => void approve(w.id)} className="rounded-lg p-2 text-emerald-400 hover:bg-emerald-500/10">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="Rejeitar" onClick={() => void reject(w.id)} className="rounded-lg p-2 text-red-400 hover:bg-red-500/10">
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-widest text-white">Usuários recentes</h3>
            <Link to="/admin/users" className="text-[10px] font-bold uppercase text-amber-400 hover:underline">
              Ver todos →
            </Link>
          </div>
          <ul className="space-y-2">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-white">{u.username || u.email || `#${u.id}`}</p>
                  <p className="text-[10px] text-slate-500">#{u.id}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleBan(u.id, Boolean(u.isBanned))}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold uppercase ${
                    u.isBanned ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                  }`}
                >
                  <Ban className="h-3 w-3" />
                  {u.isBanned ? 'Desbanir' : 'Banir'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <Link to="/admin/traffic" className="rounded-lg border border-slate-800 px-3 py-2 hover:border-sky-500/40 hover:text-sky-300">
          Tráfego (landing hits)
        </Link>
        <Link to="/admin/analytics" className="rounded-lg border border-slate-800 px-3 py-2 hover:border-amber-500/40 hover:text-amber-300">
          Analytics financeiros
        </Link>
        <Link to="/admin/metrics" className="rounded-lg border border-slate-800 px-3 py-2 hover:border-violet-500/40 hover:text-violet-300">
          Métricas ops
        </Link>
        <span className="inline-flex items-center gap-1 px-2 text-slate-600">
          <HardDrive className="h-3 w-3" /> banidos: {stats?.usersBanned ?? 0}
        </span>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-3 flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4 text-amber-400" />
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-2xl font-black text-white">{value}</p>
      {sub ? <p className="mt-1 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}
