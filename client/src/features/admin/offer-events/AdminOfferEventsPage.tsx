import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { adminOfferEventsApi, readAxiosResponseMessage } from '../lib/admin.api';

type OfferEventRow = { id: number; title?: string; slug?: string; isActive?: boolean };

export default function AdminOfferEventsPage() {
  const [rows, setRows] = useState<OfferEventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminOfferEventsApi.list();
      const data = res.data as { ok?: boolean; events?: OfferEventRow[] };
      setRows(data.events ?? []);
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao listar eventos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-white">Eventos de oferta</h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </header>
      {loading ? (
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />
      ) : (
        <ul className="space-y-2">
          {rows.map((e) => (
            <li key={e.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3">
              <div>
                <p className="font-bold text-white">{e.title ?? e.slug ?? `#${e.id}`}</p>
                <p className="text-xs text-slate-500">{e.isActive ? 'Ativo' : 'Inativo'}</p>
              </div>
              <Link to={`/admin/offer-events/${e.id}`} className="text-xs font-bold text-amber-400">
                Gerenciar
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
