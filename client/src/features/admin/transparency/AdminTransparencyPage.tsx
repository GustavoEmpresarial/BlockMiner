import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../shared/auth/auth.store';
import { readAxiosResponseMessage } from '../lib/admin.api';

type Entry = {
  id: number;
  title?: string | null;
  amountUsd?: number | string | null;
  direction?: string | null;
  category?: string | null;
  period?: string | null;
  createdAt?: string;
};

export default function AdminTransparencyPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok?: boolean; entries?: Entry[] }>('/admin/transparency');
      setEntries(res.data.entries ?? []);
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao carregar transparência');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white">Transparência</h1>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </header>
      {loading ? (
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900/80 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Título</th>
                <th className="px-4 py-3 text-left">USD</th>
                <th className="px-4 py-3 text-left">Direção</th>
                <th className="px-4 py-3 text-left">Categoria</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-white/5">
                  <td className="px-4 py-3 font-mono text-slate-400">{e.id}</td>
                  <td className="px-4 py-3 text-white">{e.title ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-emerald-400">{e.amountUsd ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{e.direction ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{e.category ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
