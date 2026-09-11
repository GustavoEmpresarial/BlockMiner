import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { listAdminFraudSignals, readAxiosResponseMessage } from '../lib/admin.api';

export default function AdminFraudSignalsPage() {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdminFraudSignals({ scope: 'all', page, limit: 30 });
      setData(res.data);
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao carregar sinais');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white">Sinais de fraude</h1>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </header>
      {loading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" /> : null}
      <pre className="max-h-[70vh] overflow-auto rounded-2xl border border-white/10 bg-slate-950 p-4 text-xs text-slate-300">
        {JSON.stringify(data, null, 2)}
      </pre>
      <div className="flex gap-2 justify-center">
        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-white/10 px-3 py-1 text-xs disabled:opacity-40">
          Anterior
        </button>
        <button type="button" onClick={() => setPage((p) => p + 1)} className="rounded border border-white/10 px-3 py-1 text-xs">
          Próxima
        </button>
      </div>
    </div>
  );
}
