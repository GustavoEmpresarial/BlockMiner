import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { listAdminUsers, readAxiosResponseMessage } from '../lib/admin.api';

type UserRow = {
  id: number;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  is_banned?: boolean;
  createdAt?: string;
};

export default function AdminUsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdminUsers({ page, pageSize: 25, query: applied });
      const data = res.data as { ok?: boolean; users?: UserRow[]; total?: number; message?: string };
      if (data.ok === false) throw new Error(data.message);
      setRows(data.users ?? []);
      setTotal(Number(data.total ?? data.users?.length ?? 0));
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">Usuários</h1>
          <p className="text-sm text-slate-500">{total} total</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </header>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(query);
          setPage(1);
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white"
            placeholder="Email, nome ou ID…"
          />
        </div>
        <button type="submit" className="rounded-xl bg-amber-500/20 px-4 py-2 text-xs font-bold text-amber-300">
          Buscar
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/80 text-[10px] uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">ID</th>
              <th className="px-4 py-3 text-left">Usuário</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="py-12 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" />
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id} className="border-t border-white/5">
                  <td className="px-4 py-3 font-mono text-slate-400">{u.id}</td>
                  <td className="px-4 py-3 text-white">{u.name ?? u.username ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{u.email ?? '—'}</td>
                  <td className="px-4 py-3">{u.is_banned ? 'Banido' : 'Ativo'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/users/${u.id}`} className="text-xs font-bold text-amber-400 hover:text-amber-300">
                      Detalhes
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center gap-2">
        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-white/10 px-3 py-1 text-xs disabled:opacity-40">
          Anterior
        </button>
        <span className="text-xs text-slate-500">Página {page}</span>
        <button type="button" disabled={rows.length < 25} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-white/10 px-3 py-1 text-xs disabled:opacity-40">
          Próxima
        </button>
      </div>
    </div>
  );
}
