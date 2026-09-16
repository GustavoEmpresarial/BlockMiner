import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingBag,
  Tag,
  Trash2,
  TrendingUp,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../shared/auth/auth.store';
import ImageUploader from '../../../shared/components/ImageUploader';
import { readAxiosResponseMessage } from '../lib/admin.api';
import type { AdminOfferEventListRow } from '../lib/admin.types';
import { resolveThumb } from './offerEvents.helpers';

/* ── helpers ──────────────────────────────────────────────────────────── */

function fmtUtcRange(startsAt: string | Date, endsAt: string | Date): string {
  const fmt = (d: string | Date) =>
    new Date(d).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    });
  return `${fmt(startsAt)} – ${fmt(endsAt)} UTC`;
}

/* ── types ────────────────────────────────────────────────────────────── */

type EventRow = AdminOfferEventListRow & {
  unitSales?: number;
  uniqueBuyers?: number;
  revenuePol?: number;
};

type CreateForm = {
  title: string;
  description: string;
  imageUrl: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

const defaultForm = (): CreateForm => ({
  title: '',
  description: '',
  imageUrl: '',
  startsAt: '',
  endsAt: '',
  isActive: true,
});

/* ── sub-components ──────────────────────────────────────────────────── */

function StatusBadge({ isActive, deletedAt }: { isActive: boolean; deletedAt?: string | Date | null }) {
  if (deletedAt)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-red-400">
        <Trash2 className="h-2.5 w-2.5" />
        Deletado
      </span>
    );
  if (isActive)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400">
        <CheckCircle2 className="h-2.5 w-2.5" />
        Ativo
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-400">
      <XCircle className="h-2.5 w-2.5" />
      Inativo
    </span>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
  color = 'slate',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color?: 'slate' | 'amber' | 'emerald' | 'sky';
}) {
  const colors = {
    slate: 'text-slate-300 border-slate-700 bg-slate-800/60',
    amber: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
    emerald: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    sky: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold ${colors[color]}`}
    >
      <Icon className="h-3 w-3" />
      <span className="text-slate-400">{label}</span>
      <span className="font-black">{value}</span>
    </span>
  );
}

function EventCard({
  event,
  onToggleActive,
  onDelete,
}: {
  event: EventRow;
  onToggleActive: (id: number, active: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const isDeleted = Boolean(event.deletedAt);
  const thumb = resolveThumb(event.imageUrl);

  return (
    <div
      className={`group relative flex flex-col gap-4 overflow-hidden rounded-2xl border p-4 transition-all duration-200 sm:flex-row sm:items-center sm:gap-5 sm:p-5 ${
        isDeleted
          ? 'border-red-500/20 bg-slate-950/40 opacity-60'
          : event.isActive
            ? 'border-amber-500/20 bg-slate-900/60 hover:border-amber-500/35'
            : 'border-white/10 bg-slate-950/50 hover:border-white/20'
      }`}
    >
      {/* Thumb */}
      <div className="flex h-16 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-slate-800 sm:h-20 sm:w-16">
        {thumb ? (
          <img src={thumb} alt={event.title} className="h-full w-full object-cover" />
        ) : (
          <ShoppingBag className="h-8 w-8 text-slate-600" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge isActive={event.isActive} deletedAt={event.deletedAt} />
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
            <Calendar className="h-3 w-3" />
            {fmtUtcRange(event.startsAt, event.endsAt)}
          </span>
        </div>

        <p className="truncate font-black text-white">{event.title}</p>

        <div className="flex flex-wrap gap-1.5">
          <StatChip icon={Package} label="Miners" value={event.minerCount ?? 0} />
          <StatChip icon={ShoppingBag} label="Vendas" value={event.unitSales ?? event.purchaseCount ?? 0} color="amber" />
          <StatChip icon={TrendingUp} label="POL" value={(event.revenuePol ?? 0).toFixed(2)} color="emerald" />
          {event.uniqueBuyers != null && (
            <StatChip icon={Zap} label="Compradores" value={event.uniqueBuyers} color="sky" />
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-white/5 pt-3 sm:border-t-0 sm:pt-0">
        {!isDeleted && (
          <button
            type="button"
            onClick={() => onToggleActive(event.id, !event.isActive)}
            className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all ${
              event.isActive
                ? 'border-slate-600 bg-slate-800 text-slate-300 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
            }`}
          >
            {event.isActive ? 'Desativar' : 'Ativar'}
          </button>
        )}

        <Link
          to={`/admin/offer-events/${event.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-400 transition-all hover:bg-amber-500/20"
        >
          <Pencil className="h-3 w-3" />
          Gerenciar
        </Link>

        {!isDeleted && (
          <button
            type="button"
            onClick={() => onDelete(event.id)}
            className="rounded-lg border border-transparent p-1.5 text-slate-600 transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
            title="Deletar evento"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ── slide-over de criação ────────────────────────────────────────────── */

function CreateSlideOver({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [form, setForm] = useState<CreateForm>(defaultForm);
  const [saving, setSaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setForm(defaultForm());
  }, [open]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload = {
        title: form.title,
        description: form.description,
        imageUrl: form.imageUrl || null,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        isActive: form.isActive,
      };
      const res = await api.post<{ ok: boolean; event?: { id: number } }>('/admin/offer-events', payload);
      if (res.data.ok && res.data.event?.id) {
        toast.success('Evento criado! Adicione os miners agora.');
        onCreated(res.data.event.id);
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao criar evento');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-slate-600 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30';

  return (
    <>
      {/* backdrop */}
      <div
        ref={overlayRef}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      {/* panel */}
      <div
        className={`fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-lg flex-col overflow-y-auto border-l border-slate-800 bg-slate-950 shadow-2xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-amber-400" />
            <h2 className="text-base font-black text-white">Nova Oferta</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* form */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5 p-6">
          {/* título */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Título <span className="text-red-400">*</span>
            </label>
            <input
              className={field}
              placeholder="Ex: Mining Revolution"
              value={form.title}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              required
            />
          </div>

          {/* descrição */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Descrição <span className="text-red-400">*</span>
            </label>
            <textarea
              className={`${field} min-h-[100px] resize-none`}
              placeholder="Descrição do evento de oferta..."
              value={form.description}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              required
            />
          </div>

          {/* imagem */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Imagem do Evento
            </label>
            <ImageUploader
              label=""
              value={form.imageUrl}
              onChange={(url: string) => setForm((f) => ({ ...f, imageUrl: url }))}
              previewClass="max-h-32"
            />
          </div>

          {/* datas */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Início (UTC) <span className="text-red-400">*</span>
              </label>
              <input
                type="datetime-local"
                className={field}
                value={form.startsAt}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setForm((f) => ({ ...f, startsAt: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Fim (UTC) <span className="text-red-400">*</span>
              </label>
              <input
                type="datetime-local"
                className={field}
                value={form.endsAt}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setForm((f) => ({ ...f, endsAt: e.target.value }))
                }
                required
              />
            </div>
          </div>

          {/* ativo */}
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
            <div
              onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
              className={`relative h-5 w-9 cursor-pointer rounded-full transition-colors ${form.isActive ? 'bg-amber-500' : 'bg-slate-700'}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.isActive ? 'translate-x-4' : 'translate-x-0.5'}`}
              />
            </div>
            <span className="text-sm font-bold text-slate-300">
              {form.isActive ? 'Evento ativo (visível na loja)' : 'Evento inativo (oculto)'}
            </span>
          </label>

          {/* spacer */}
          <div className="flex-1" />

          {/* submit */}
          <div className="border-t border-slate-800 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-black text-slate-950 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? 'Criando...' : 'Criar evento e adicionar miners'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

/* ── main page ────────────────────────────────────────────────────────── */

export default function AdminOfferEventsPage() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; events?: EventRow[] }>('/admin/offer-events');
      setRows(res.data.events ?? []);
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao listar eventos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggleActive = async (id: number, active: boolean) => {
    const prev = rows;
    setRows((r) => r.map((e) => (e.id === id ? { ...e, isActive: active } : e)));
    try {
      await api.put(`/admin/offer-events/${id}`, { isActive: active });
      toast.success(active ? 'Evento ativado' : 'Evento desativado');
    } catch (err) {
      setRows(prev);
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao atualizar');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Deletar este evento? (soft delete — reversível via banco)')) return;
    try {
      await api.delete(`/admin/offer-events/${id}`);
      toast.success('Evento deletado');
      void load();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao deletar');
    }
  };

  const handleCreated = (id: number) => {
    setShowCreate(false);
    window.location.href = `/admin/offer-events/${id}?tab=miners`;
  };

  const activeCount = rows.filter((r) => r.isActive && !r.deletedAt).length;
  const totalSales = rows.reduce((s, r) => s + (r.unitSales ?? r.purchaseCount ?? 0), 0);
  const totalRevenue = rows.reduce((s, r) => s + (r.revenuePol ?? 0), 0);

  return (
    <>
      <div className="space-y-6">
        {/* header */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-white">Eventos de Oferta</h1>
            <p className="mt-1 text-xs text-slate-500">
              {rows.length} evento{rows.length !== 1 ? 's' : ''} · {activeCount} ativo
              {activeCount !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-600 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-slate-950 transition-all hover:brightness-110"
            >
              <Plus className="h-4 w-4" />
              Nova Oferta
            </button>
          </div>
        </header>

        {/* stats bar */}
        {rows.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Ativos', value: activeCount, icon: CheckCircle2, color: 'emerald' },
              { label: 'Vendas totais', value: totalSales, icon: ShoppingBag, color: 'amber' },
              { label: 'Receita POL', value: totalRevenue.toFixed(2), icon: TrendingUp, color: 'sky' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-center"
              >
                <Icon
                  className={`mx-auto mb-1 h-4 w-4 ${color === 'emerald' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : 'text-sky-400'}`}
                />
                <p className="text-lg font-black text-white">{value}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-20 text-center">
            <ShoppingBag className="mb-3 h-12 w-12 text-slate-700" />
            <p className="font-bold text-slate-400">Nenhum evento criado ainda</p>
            <p className="mt-1 text-xs text-slate-600">Clique em "Nova Oferta" para começar</p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-500/20 px-4 py-2 text-xs font-black text-amber-400 hover:bg-amber-500/30"
            >
              <Plus className="h-4 w-4" />
              Nova Oferta
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <CreateSlideOver
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
