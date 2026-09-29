import { useState } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminMinersList } from './adminMiners.hooks';
import { adminMinersApi } from './adminMiners.api';
import { AdminBrokenMachinesPanel } from './AdminBrokenMachinesPanel';
import { readAxiosResponseMessage } from '../lib/admin.api';

export default function AdminMinersPage() {
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [page, setPage] = useState(1);
  const { miners, total, loading, listError, reload } = useAdminMinersList({
    page,
    limit: 50,
    filter: 'all',
    sort: 'name',
    q: appliedQ,
  });

  const toggleActive = async (id: number | string) => {
    try {
      await adminMinersApi.toggleActive(id);
      toast.success('Status atualizado');
      void reload();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao atualizar');
    }
  };

  const toggleStore = async (id: number | string) => {
    try {
      await adminMinersApi.toggleStore(id);
      toast.success('Visibilidade na loja atualizada');
      void reload();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao atualizar');
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">Mineradoras (catálogo)</h1>
          <p className="text-sm text-slate-500">{total} registro(s)</p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </header>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setAppliedQ(q);
          setPage(1);
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou slug…"
            className="w-full rounded-xl border border-white/10 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white"
          />
        </div>
        <button type="submit" className="rounded-xl bg-amber-500/20 px-4 py-2 text-xs font-bold text-amber-300">
          Buscar
        </button>
      </form>

      {listError ? (
        <p className="rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">{listError}</p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">H/s</th>
              <th className="px-4 py-3">Preço</th>
              <th className="px-4 py-3">Ativa</th>
              <th className="px-4 py-3">Loja</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </td>
              </tr>
            ) : (
              miners.map((m) => (
                <tr key={String(m.id)} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 font-mono text-slate-400">{m.id}</td>
                  <td className="px-4 py-3 font-bold text-white">{m.name}</td>
                  <td className="px-4 py-3 font-mono text-slate-300">{m.baseHashRate ?? m.hashRate ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-emerald-400">{m.price ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${m.isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                      {m.isActive ? 'Sim' : 'Não'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void toggleStore(m.id)}
                      className={`text-xs font-bold ${m.showInShop ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-500 hover:text-slate-400'}`}
                    >
                      {m.showInShop ? 'Visível' : 'Oculto'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void toggleActive(m.id)}
                      className="inline-flex items-center px-2.5 py-1 rounded-lg border border-slate-700 text-xs font-bold text-amber-400 hover:bg-slate-800"
                    >
                      Alternar Ativa
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AdminBrokenMachinesPanel />
    </div>
  );
}
