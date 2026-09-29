import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Flame,
  Plus,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  Users,
  Power,
  Pencil,
  Zap,
  Award,
  AlertTriangle,
  Search,
  History,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminBurnEventsApi } from './adminBurnEvents.api';
import type { AdminBurnEventRow, CatalogMiner } from './adminBurnEvents.types';
import { BurnEventFormModal } from './BurnEventFormModal';
import { BurnEventClaimsModal } from './BurnEventClaimsModal';
import { readAxiosResponseMessage } from '../lib/admin.api';

export default function AdminBurnEvents() {
  const [events, setEvents] = useState<AdminBurnEventRow[]>([]);
  const [miners, setMiners] = useState<CatalogMiner[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filters & Search
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');

  // Modals
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AdminBurnEventRow | null>(null);

  const [claimsModalOpen, setClaimsModalOpen] = useState(false);
  const [inspectingEvent, setInspectingEvent] = useState<AdminBurnEventRow | null>(null);

  const [deletingEvent, setDeletingEvent] = useState<AdminBurnEventRow | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  // Quick edit busy states
  const [busyRowId, setBusyRowId] = useState<number | null>(null);
  const [limitsDraft, setLimitsDraft] = useState<Record<number, { claimLimit: string; stock: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [eRes, mRes] = await Promise.all([
        adminBurnEventsApi.listAll(),
        adminBurnEventsApi.listCatalogMiners(),
      ]);
      const loadedEvents = eRes.data.events || [];
      setEvents(loadedEvents);
      setMiners(mRes.data.miners || []);

      // Initialize quick drafts for limits
      const drafts: Record<number, { claimLimit: string; stock: string }> = {};
      for (const ev of loadedEvents) {
        drafts[ev.id] = {
          claimLimit: String(ev.claimLimitPerUser),
          stock: ev.stockTotal == null ? '' : String(ev.stockTotal),
        };
      }
      setLimitsDraft(drafts);
    } catch (e: unknown) {
      setErr(readAxiosResponseMessage(e) ?? 'Erro ao carregar eventos ou catálogo de máquinas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Statistics KPIs
  const stats = useMemo(() => {
    const activeCount = events.filter((e) => e.isActive).length;
    const totalClaims = events.reduce((acc, e) => acc + (e._count?.claims ?? 0), 0);
    const totalStock = events.reduce((acc, e) => acc + (e.stockTotal ?? 0), 0);
    return { activeCount, totalClaims, totalStock };
  }, [events]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (statusFilter === 'active' && !ev.isActive) return false;
      if (statusFilter === 'paused' && ev.isActive) return false;
      if (q.trim()) {
        const query = q.toLowerCase().trim();
        const matchesTitle = ev.title.toLowerCase().includes(query);
        const matchesMiner = ev.rewardMiner?.name?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesMiner) return false;
      }
      return true;
    });
  }, [events, statusFilter, q]);

  // Quick toggle active
  const handleToggle = async (event: AdminBurnEventRow) => {
    setBusyRowId(event.id);
    try {
      const res = await adminBurnEventsApi.update(event.id, { isActive: !event.isActive });
      if (res.data.ok) {
        toast.success(`Evento "${event.title}" ${event.isActive ? 'pausado' : 'ativado'} com sucesso!`);
        void load();
      } else {
        toast.error(res.data.message || 'Erro ao alternar status do evento.');
      }
    } catch (e) {
      toast.error(readAxiosResponseMessage(e) || 'Erro ao alternar status.');
    } finally {
      setBusyRowId(null);
    }
  };

  // Quick save limits
  const handleSaveLimits = async (event: AdminBurnEventRow) => {
    const draft = limitsDraft[event.id];
    if (!draft) return;
    setBusyRowId(event.id);
    try {
      const numClaim = parseInt(draft.claimLimit, 10) || 10;
      const numStock = draft.stock.trim() === '' ? null : parseInt(draft.stock, 10);
      const res = await adminBurnEventsApi.update(event.id, {
        claimLimitPerUser: numClaim,
        stockTotal: numStock,
      });
      if (res.data.ok) {
        toast.success('Limites atualizados com sucesso!');
        void load();
      } else {
        toast.error(res.data.message || 'Erro ao salvar limites.');
      }
    } catch (e) {
      toast.error(readAxiosResponseMessage(e) || 'Erro ao salvar limites.');
    } finally {
      setBusyRowId(null);
    }
  };

  // Confirm delete (replaces window.confirm)
  const executeDelete = async () => {
    if (!deletingEvent) return;
    setDeletingBusy(true);
    try {
      const res = await adminBurnEventsApi.remove(deletingEvent.id);
      if (res.data.ok) {
        toast.success(`Evento "${deletingEvent.title}" removido com sucesso.`);
        setDeletingEvent(null);
        void load();
      } else {
        toast.error(res.data.message || 'Erro ao remover evento.');
      }
    } catch (e) {
      toast.error(readAxiosResponseMessage(e) || 'Erro ao remover evento.');
    } finally {
      setDeletingBusy(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
              <Flame className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight">Eventos de Queima</h1>
              <p className="text-sm text-slate-400 mt-1">
                Configure eventos para destruição de máquinas antigas em troca de mineradoras de maior potência.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void load()}
            className="p-2.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Atualizar lista"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingEvent(null);
              setFormModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-400 shadow-lg shadow-orange-500/20 transition"
          >
            <Plus className="h-4 w-4" />
            Novo Evento
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total de Eventos</span>
            <Flame className="h-4 w-4 text-orange-400" />
          </div>
          <p className="text-2xl font-black text-white">{events.length}</p>
          <p className="text-xs text-slate-500 mt-1">Eventos configurados</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Eventos Ativos</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400">{stats.activeCount}</p>
          <p className="text-xs text-slate-500 mt-1">Disponíveis na página /burn</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total de Resgates</span>
            <Users className="h-4 w-4 text-blue-400" />
          </div>
          <p className="text-2xl font-black text-blue-400">{stats.totalClaims}</p>
          <p className="text-xs text-slate-500 mt-1">Queimas completadas por jogadores</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Catálogo Disponível</span>
            <Award className="h-4 w-4 text-amber-300" />
          </div>
          <p className="text-2xl font-black text-amber-300">{miners.length}</p>
          <p className="text-xs text-slate-500 mt-1">Máquinas elegíveis para prêmio</p>
        </div>
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-2xl border border-white/5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar evento por título ou máquina-prêmio…"
            className="w-full rounded-xl border border-white/10 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white focus:border-orange-500/60 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              statusFilter === 'all'
                ? 'bg-orange-500 text-white'
                : 'text-slate-400 hover:text-white bg-slate-800/40'
            }`}
          >
            Todos ({events.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              statusFilter === 'active'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-400 hover:text-white bg-slate-800/40'
            }`}
          >
            Ativos ({stats.activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('paused')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              statusFilter === 'paused'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-white bg-slate-800/40'
            }`}
          >
            Pausados ({events.length - stats.activeCount})
          </button>
        </div>
      </div>

      {/* Events List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-orange-400 mb-2" />
          <span className="text-xs">Carregando eventos de queima...</span>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-3xl border border-white/5 bg-slate-900/20 p-8">
          <Flame className="h-12 w-12 text-slate-700 mb-3" />
          <p className="text-slate-300 font-bold text-base">Nenhum evento de queima encontrado</p>
          <p className="text-slate-500 text-xs mt-1">Crie um novo evento usando o botão acima.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEvents.map((e) => {
            const isBusy = busyRowId === e.id;
            const draft = limitsDraft[e.id] || {
              claimLimit: String(e.claimLimitPerUser),
              stock: e.stockTotal == null ? '' : String(e.stockTotal),
            };
            const stockLabel =
              e.stockTotal == null
                ? `${e.stockClaimed} concedidas (estoque ilimitado)`
                : `${e.stockClaimed} / ${e.stockTotal} concedidas`;

            return (
              <div
                key={e.id}
                className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-lg flex flex-col md:flex-row items-start md:items-center gap-5 hover:border-white/20 transition"
              >
                {/* Visual Thumbnail */}
                <div className="h-16 w-16 rounded-2xl bg-slate-950 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center p-2">
                  {e.rewardMiner?.imageUrl ? (
                    <img src={e.rewardMiner.imageUrl} alt={e.title} className="h-full w-full object-contain" />
                  ) : (
                    <Flame className="h-8 w-8 text-orange-400/50" />
                  )}
                </div>

                {/* Event Details */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-black tracking-wide ${
                        e.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {e.isActive ? 'ATIVO' : 'PAUSADO'}
                    </span>
                    <h3 className="font-bold text-white text-base truncate">{e.title}</h3>
                    <span className="font-mono text-xs text-slate-500">#{e.id}</span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Queime ≥{' '}
                    <strong className="text-orange-400 font-mono font-bold">
                      {e.requiredHashRate.toLocaleString('pt-BR')} H/s
                    </strong>{' '}
                    para receber{' '}
                    <strong className="text-emerald-400">{e.rewardMiner?.name || 'Máquina de Prêmio'}</strong>
                    {' · '}
                    <span className="text-slate-300">{stockLabel}</span>
                  </p>

                  {/* Inline quick limits */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span>Limite/Player:</span>
                      <input
                        type="number"
                        min={1}
                        value={draft.claimLimit}
                        onChange={(ev) =>
                          setLimitsDraft((prev) => ({
                            ...prev,
                            [e.id]: { ...draft, claimLimit: ev.target.value },
                          }))
                        }
                        className="w-16 rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs font-mono text-white text-center"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span>Estoque:</span>
                      <input
                        type="number"
                        min={1}
                        value={draft.stock}
                        onChange={(ev) =>
                          setLimitsDraft((prev) => ({
                            ...prev,
                            [e.id]: { ...draft, stock: ev.target.value },
                          }))
                        }
                        placeholder="Ilimitado"
                        className="w-20 rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs font-mono text-white text-center placeholder:text-slate-600"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleSaveLimits(e)}
                      className="px-2.5 py-1 rounded-lg border border-orange-500/30 bg-orange-500/10 text-[11px] font-bold text-orange-300 hover:bg-orange-500/20 disabled:opacity-50 transition"
                    >
                      Salvar Limites
                    </button>
                  </div>
                </div>

                {/* Claims Counter & Actions */}
                <div className="flex flex-wrap items-center gap-2 self-stretch md:self-center justify-end pt-3 md:pt-0 border-t md:border-t-0 border-white/5">
                  <button
                    type="button"
                    onClick={() => {
                      setInspectingEvent(e);
                      setClaimsModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 bg-slate-800 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition"
                    title="Ver histórico de claims"
                  >
                    <Users className="h-4 w-4 text-blue-400" />
                    <span>{e._count?.claims ?? 0} claims</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingEvent(e);
                      setFormModalOpen(true);
                    }}
                    className="p-2.5 rounded-xl border border-white/10 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"
                    title="Editar evento"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleToggle(e)}
                    className={`p-2.5 rounded-xl border transition ${
                      e.isActive
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                    }`}
                    title={e.isActive ? 'Pausar evento' : 'Ativar evento'}
                  >
                    <Power className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeletingEvent(e)}
                    className="p-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                    title="Excluir evento"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal (Create & Edit) */}
      <BurnEventFormModal
        isOpen={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSaved={() => void load()}
        event={editingEvent}
        miners={miners}
      />

      {/* Claims History Modal */}
      <BurnEventClaimsModal
        isOpen={claimsModalOpen}
        onClose={() => setClaimsModalOpen(false)}
        event={inspectingEvent}
      />

      {/* Delete Confirmation Modal (NO window.confirm) */}
      {deletingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-3xl border border-red-500/30 bg-slate-900 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Remover Evento de Queima</h3>
                <p className="text-xs text-slate-400">Confirmação de segurança</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Tem certeza que deseja remover o evento <strong>"{deletingEvent.title}"</strong>? O histórico de claims e
              máquinas já resgatadas será mantido, mas o evento deixará de aparecer para os jogadores.
            </p>

            <footer className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={deletingBusy}
                onClick={() => setDeletingEvent(null)}
                className="rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingBusy}
                onClick={() => void executeDelete()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deletingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span>{deletingBusy ? 'Removendo...' : 'Sim, remover'}</span>
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
