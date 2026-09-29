import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Users, History, Calendar, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminBurnEventsApi } from './adminBurnEvents.api';
import type { AdminBurnClaimRow, AdminBurnEventRow } from './adminBurnEvents.types';

interface BurnEventClaimsModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: AdminBurnEventRow | null;
}

export function BurnEventClaimsModal({ isOpen, onClose, event }: BurnEventClaimsModalProps) {
  const [claims, setClaims] = useState<AdminBurnClaimRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const loadClaims = useCallback(async (p: number) => {
    if (!event?.id) return;
    setLoading(true);
    try {
      const res = await adminBurnEventsApi.listClaims(event.id, p);
      if (res.data.ok) {
        setClaims(res.data.claims || []);
        setTotal(res.data.total || 0);
      } else {
        setClaims([]);
        setTotal(0);
      }
    } catch {
      setClaims([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [event?.id]);

  useEffect(() => {
    if (isOpen && event?.id) {
      setPage(1);
      void loadClaims(1);
    }
  }, [isOpen, event?.id, loadClaims]);

  if (!isOpen || !event) return null;

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-3xl border border-white/10 bg-slate-900 shadow-2xl p-6 my-8 flex flex-col max-h-[85vh]">
        <header className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">Histórico de Queimas / Claims</h2>
              <p className="text-xs text-slate-400">
                Evento: <strong>{event.title}</strong> · {total} resgate(s) registrado(s)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-white/5 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto mt-4 pr-1">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin text-orange-400 mb-2" />
              <span className="text-xs">Carregando histórico de resgates...</span>
            </div>
          ) : claims.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              Nenhuma queima realizada para este evento até o momento.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/5">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3">ID / Data</th>
                    <th className="px-4 py-3">Jogador</th>
                    <th className="px-4 py-3">Poder Queimado</th>
                    <th className="px-4 py-3">Máquina Concedida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {claims.map((c) => (
                    <tr key={c.id} className="hover:bg-white/[0.02] transition">
                      <td className="px-4 py-3">
                        <span className="font-mono text-slate-400 block">#{c.id}</span>
                        <span className="text-[11px] text-slate-500 block">
                          {c.claimedAt ? new Date(c.claimedAt).toLocaleString('pt-BR') : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-white">
                          {c.user?.username || c.user?.email || `User #${c.userId}`}
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">ID: {c.userId}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-orange-400">
                          {c.totalHashRate ? c.totalHashRate.toLocaleString('pt-BR') : '0'} H/s
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-emerald-400">
                          {c.rewardMinerName || event.rewardMiner.name}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <footer className="flex items-center justify-between pt-4 border-t border-white/10 shrink-0 text-xs text-slate-400">
            <span>
              Página {page} de {totalPages} ({total} claims)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => {
                  const p = page - 1;
                  setPage(p);
                  void loadClaims(p);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-white/10 bg-slate-800 disabled:opacity-40 hover:bg-slate-700"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Anterior</span>
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => {
                  const p = page + 1;
                  setPage(p);
                  void loadClaims(p);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-white/10 bg-slate-800 disabled:opacity-40 hover:bg-slate-700"
              >
                <span>Próximo</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
