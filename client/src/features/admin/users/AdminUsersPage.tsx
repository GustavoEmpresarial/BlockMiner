import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserCheck,
  UserX,
  Search,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Shield,
  Coins,
  Calendar,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminUsersApi } from './adminUsers.api';
import type { AdminUsersListRow, AdminUsersStats } from './adminUsers.types';

export default function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUsersListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'banned'>('all');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminUsersStats>({ total: 0, active: 0, banned: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminUsersApi.listUsers({
        page,
        pageSize,
        query: appliedQuery || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });

      if (res.data.ok) {
        setRows(res.data.users ?? []);
        setTotal(Number(res.data.total ?? 0));
        if (res.data.stats) {
          setStats(res.data.stats);
        }
      }
    } catch {
      toast.error('Erro ao carregar lista de usuários.');
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, page, pageSize, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSearchSubmit = () => {
    setAppliedQuery(query.trim());
    setPage(1);
  };

  const handleKeyDownSearch = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearchSubmit();
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ─── Top Header ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
              <Users className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
                Gestão de Usuários &amp; Jogadores
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Diretório
                </span>
              </h1>
              <p className="text-slate-400 text-xs mt-0.5 max-w-xl">
                Administração central de contas, permissões, saldos de criptomoedas, status de banimento e inventário.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 text-xs font-bold hover:bg-slate-700 transition-all shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>

        {/* ─── KPI Stats ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-6 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => { setStatusFilter('all'); setPage(1); }}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              statusFilter === 'all'
                ? 'bg-slate-800 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              <Users className="w-3.5 h-3.5 text-sky-400" />
              Total de Contas
            </div>
            <div className="text-2xl font-black text-white mt-1">{stats.total || total}</div>
          </button>

          <button
            type="button"
            onClick={() => { setStatusFilter('active'); setPage(1); }}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              statusFilter === 'active'
                ? 'bg-emerald-500/15 border-emerald-500/60 shadow-md ring-1 ring-emerald-500/30'
                : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
              <UserCheck className="w-3.5 h-3.5" />
              Usuários Ativos
            </div>
            <div className="text-2xl font-black text-emerald-400 mt-1">{stats.active}</div>
          </button>

          <button
            type="button"
            onClick={() => { setStatusFilter('banned'); setPage(1); }}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              statusFilter === 'banned'
                ? 'bg-red-500/15 border-red-500/60 shadow-md ring-1 ring-red-500/30'
                : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5 text-red-400 text-[10px] font-bold uppercase tracking-wider">
              <UserX className="w-3.5 h-3.5" />
              Usuários Banidos
            </div>
            <div className="text-2xl font-black text-red-400 mt-1">{stats.banned}</div>
          </button>
        </div>
      </div>

      {/* ─── Search & Filters Bar ──────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md">
        {/* Status filter tabs */}
        <div className="flex items-center gap-1.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => { setStatusFilter('all'); setPage(1); }}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              statusFilter === 'all'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            Todos ({stats.total || total})
          </button>
          <button
            type="button"
            onClick={() => { setStatusFilter('active'); setPage(1); }}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              statusFilter === 'active'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            Ativos ({stats.active})
          </button>
          <button
            type="button"
            onClick={() => { setStatusFilter('banned'); setPage(1); }}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              statusFilter === 'banned'
                ? 'bg-red-500 text-white shadow-md shadow-red-500/20'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            Banidos ({stats.banned})
          </button>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-2 w-full md:w-96">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDownSearch}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-8 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
              placeholder="Buscar por ID, nome, usuário, email, IP ou carteira…"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); setAppliedQuery(''); setPage(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSearchSubmit}
            className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 hover:bg-slate-700 transition-colors shrink-0"
          >
            Buscar
          </button>
        </div>
      </div>

      {/* ─── Users Table ───────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm">
        <table className="min-w-full text-xs text-left">
          <thead className="bg-slate-950/80 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3.5">ID</th>
              <th className="px-4 py-3.5">Jogador</th>
              <th className="px-4 py-3.5">E-mail</th>
              <th className="px-4 py-3.5">Saldo POL</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5">Cadastro</th>
              <th className="px-4 py-3.5 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-slate-500">
                  <Loader2 className="mx-auto h-7 w-7 animate-spin text-amber-500 mb-2" />
                  <p className="font-bold">Carregando usuários...</p>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-slate-500">
                  <Users className="mx-auto h-8 w-8 text-slate-600 mb-2" />
                  <p className="font-bold text-white text-sm">Nenhum usuário encontrado</p>
                  <p className="text-xs mt-1">Tente ajustar seus termos de busca ou filtros.</p>
                </td>
              </tr>
            ) : (
              rows.map((u) => {
                const displayName = u.username ?? u.name ?? `Jogador #${u.id}`;
                const initial = displayName[0]?.toUpperCase() ?? 'U';
                const isBanned = Boolean(u.isBanned);

                return (
                  <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3.5 font-mono text-slate-400">#{u.id}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-300 text-xs shrink-0">
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-white truncate block">{displayName}</span>
                          {u.name && u.username && u.name !== u.username && (
                            <span className="text-[10px] text-slate-500 truncate block">({u.name})</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-300">{u.email ?? '—'}</td>
                    <td className="px-4 py-3.5 font-mono font-bold text-amber-300">
                      {Number(u.polBalance || 0).toFixed(4)} POL
                    </td>
                    <td className="px-4 py-3.5">
                      {isBanned ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-500/15 text-red-300 border border-red-500/30">
                          Banido
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          Ativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-400 whitespace-nowrap">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        to={`/admin/users/${u.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 font-bold transition-all"
                      >
                        <span>Ver Perfil</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Pagination ────────────────────────────────────────────── */}
      {total > pageSize && (
        <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-xs font-bold">
          <span className="text-slate-500">
            Página {page} de {totalPages} ({total} usuários)
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:text-white disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:text-white disabled:opacity-40"
            >
              Próxima
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
