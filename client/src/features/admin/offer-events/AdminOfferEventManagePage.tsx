import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Infinity,
  Loader2,
  Package,
  Pencil,
  Plus,
  Receipt,
  Save,
  ShoppingBag,
  Tag,
  Trash2,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import ImageUploader from '../../../shared/components/ImageUploader';
import type {
  AdminOfferEventDetail,
  AdminOfferEventManageFormState,
  AdminOfferEventManageTab,
  AdminOfferEventMinerFormState,
  AdminOfferEventMinerRow,
  AdminOfferEventPurchaseRow,
} from '../lib/admin.types';
import { readAxiosResponseMessage } from '../lib/admin.api';
import {
  createAdminOfferEvent,
  createAdminOfferEventMiner,
  deleteAdminOfferEventMiner,
  getAdminOfferEvent,
  listAdminOfferEventMiners,
  listAdminOfferEventPurchases,
  updateAdminOfferEvent,
  updateAdminOfferEventMiner,
} from './adminOfferEvents.api';
import { resolveThumb } from './offerEvents.helpers';

/* ── constants ───────────────────────────────────────────────────────── */

const CURRENCIES = ['POL', 'BTC', 'ETH', 'USDT', 'USDC', 'ZER', 'BLK'] as const;
const TAB_KEYS: AdminOfferEventManageTab[] = ['event', 'miners', 'sales'];

/* ── helpers ──────────────────────────────────────────────────────────── */

function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC';
}

/* ── default form states ─────────────────────────────────────────────── */

const defaultEventForm = (): AdminOfferEventManageFormState => ({
  title: '',
  description: '',
  imageUrl: '',
  startsAt: '',
  endsAt: '',
  isActive: true,
});

const defaultMinerForm = (): AdminOfferEventMinerFormState => ({
  name: '',
  description: '',
  imageUrl: '',
  price: '',
  hashRate: '',
  currency: 'POL',
  stockUnlimited: false,
  stockCount: '',
  slotSize: 1,
  isActive: true,
  isFree: false,
  claimLimitPerUser: 1,
});

/* ── MinerCard ────────────────────────────────────────────────────────── */

function MinerCard({
  miner,
  onEdit,
  onRemove,
}: {
  miner: AdminOfferEventMinerRow;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const thumb = resolveThumb(miner.imageUrl);
  const stockUsed = miner.soldCount ?? 0;
  const stockTotal = miner.stockCount ?? 0;
  const stockPct = !miner.stockUnlimited && stockTotal > 0 ? Math.min(100, (stockUsed / stockTotal) * 100) : null;

  return (
    <div
      className={`relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-4 transition-all ${
        miner.isActive
          ? 'border-white/10 bg-slate-900/60 hover:border-white/20'
          : 'border-white/5 bg-slate-950/40 opacity-60'
      }`}
    >
      {/* top row */}
      <div className="flex items-start gap-3">
        <div className="flex h-14 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-slate-800">
          {thumb ? (
            <img src={thumb} alt={miner.name} className="h-full w-full object-cover" />
          ) : (
            <Cpu className="h-6 w-6 text-slate-600" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-black text-white">{miner.name}</p>
            {miner.isFree ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-400">
                GRÁTIS
              </span>
            ) : (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-400">
                {Number(miner.price)} {miner.currency}
              </span>
            )}
            {!miner.isActive && (
              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase text-red-400">
                INATIVO
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap gap-2 text-[10px]">
            <span className="flex items-center gap-1 text-slate-400">
              <Zap className="h-3 w-3 text-orange-400" />
              <span className="font-bold text-orange-300">{miner.hashRate} H/s</span>
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              <Package className="h-3 w-3" />
              {miner.stockUnlimited ? (
                <span className="flex items-center gap-0.5 font-bold text-slate-300">
                  <Infinity className="h-3 w-3" /> ilimitado
                </span>
              ) : (
                <span className="font-bold text-slate-300">
                  {stockUsed} / {stockTotal}
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              Slot <span className="font-bold text-slate-300">{miner.slotSize ?? 1}</span>
            </span>
          </div>
        </div>

        {/* actions */}
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-amber-500/10 hover:text-amber-400"
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
            title="Remover"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* stock bar */}
      {stockPct !== null && (
        <div>
          <div className="mb-1 flex justify-between text-[9px] text-slate-500">
            <span>Estoque vendido</span>
            <span>{stockPct.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full transition-all ${stockPct >= 90 ? 'bg-red-400' : stockPct >= 60 ? 'bg-amber-400' : 'bg-emerald-400'}`}
              style={{ width: `${stockPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── MinerFormModal ──────────────────────────────────────────────────── */

function MinerFormModal({
  open,
  editingId,
  form,
  saving,
  onChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  editingId: number | null;
  form: AdminOfferEventMinerFormState;
  saving: boolean;
  onChange: (patch: Partial<AdminOfferEventMinerFormState>) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  const field =
    'w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-slate-600 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg space-y-0 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl"
      >
        {/* header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-950 px-6 py-4">
          <h3 className="flex items-center gap-2 font-black text-white">
            <Cpu className="h-4 w-4 text-amber-400" />
            {editingId ? 'Editar Miner' : 'Novo Miner'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* — Identificação — */}
          <section className="space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Identificação</p>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nome *</label>
              <input
                className={field}
                placeholder="Ex: NeonForge X1"
                value={form.name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Descrição</label>
              <textarea
                className={`${field} min-h-[70px] resize-none`}
                placeholder="Descrição opcional"
                value={form.description}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange({ description: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Hashrate (H/s) *</label>
              <input
                type="number"
                step="any"
                min="0"
                className={field}
                placeholder="Ex: 3500"
                value={form.hashRate}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ hashRate: e.target.value })}
                required
              />
            </div>
            <ImageUploader
              label="Imagem do Miner"
              value={form.imageUrl}
              onChange={(url: string) => onChange({ imageUrl: url })}
              previewClass="max-h-28"
            />
          </section>

          {/* — Preço — */}
          <section className="space-y-3 border-t border-white/5 pt-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Preço</p>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
              <div
                onClick={() => onChange({ isFree: !form.isFree, price: !form.isFree ? '0' : form.price })}
                className={`relative h-5 w-9 cursor-pointer rounded-full transition-colors ${form.isFree ? 'bg-emerald-500' : 'bg-slate-700'}`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.isFree ? 'translate-x-4' : 'translate-x-0.5'}`}
                />
              </div>
              <span className="text-sm font-bold text-slate-300">Miner gratuito</span>
            </label>

            {!form.isFree && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Preço *</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className={field}
                    placeholder="0.00"
                    value={form.price}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ price: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Moeda *</label>
                  <select
                    className={field}
                    value={form.currency}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange({ currency: e.target.value })}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {form.isFree && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Limite por usuário (0 = ilimitado)
                </label>
                <input
                  type="number"
                  min="0"
                  className={field}
                  placeholder="Ex: 1"
                  value={form.claimLimitPerUser}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    onChange({ claimLimitPerUser: e.target.value })
                  }
                />
              </div>
            )}
          </section>

          {/* — Estoque & Config — */}
          <section className="space-y-3 border-t border-white/5 pt-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Estoque & Configurações</p>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
              <div
                onClick={() => onChange({ stockUnlimited: !form.stockUnlimited })}
                className={`relative h-5 w-9 cursor-pointer rounded-full transition-colors ${form.stockUnlimited ? 'bg-amber-500' : 'bg-slate-700'}`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.stockUnlimited ? 'translate-x-4' : 'translate-x-0.5'}`}
                />
              </div>
              <span className="text-sm font-bold text-slate-300">Estoque ilimitado</span>
            </label>

            {!form.stockUnlimited && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quantidade em estoque *</label>
                <input
                  type="number"
                  min="1"
                  className={field}
                  placeholder="Ex: 100"
                  value={form.stockCount}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ stockCount: e.target.value })}
                  required={!form.stockUnlimited}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tamanho do slot</label>
              <div className="flex gap-2">
                {[1, 2].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onChange({ slotSize: s as 1 | 2 })}
                    className={`flex-1 rounded-xl border py-2 text-sm font-black transition-all ${
                      form.slotSize === s
                        ? 'border-amber-500/50 bg-amber-500/15 text-amber-400'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    Slot {s}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
              <div
                onClick={() => onChange({ isActive: !form.isActive })}
                className={`relative h-5 w-9 cursor-pointer rounded-full transition-colors ${form.isActive ? 'bg-emerald-500' : 'bg-slate-700'}`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.isActive ? 'translate-x-4' : 'translate-x-0.5'}`}
                />
              </div>
              <span className="text-sm font-bold text-slate-300">
                {form.isActive ? 'Miner ativo (visível)' : 'Miner inativo (oculto)'}
              </span>
            </label>
          </section>
        </div>

        {/* footer */}
        <div className="sticky bottom-0 flex gap-3 border-t border-slate-800 bg-slate-950 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-700 py-3 text-sm font-bold text-slate-300 transition-colors hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-black text-slate-950 transition-all hover:brightness-110 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editingId ? 'Salvar' : 'Criar miner'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── main page ────────────────────────────────────────────────────────── */

export default function AdminOfferEventManage() {
  const { id: routeId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') || 'event') as AdminOfferEventManageTab;
  const isNew = routeId === 'new';

  const [loading, setLoading] = useState<boolean>(!isNew);
  const [saving, setSaving] = useState<boolean>(false);
  const [eventData, setEventData] = useState<AdminOfferEventDetail | null>(null);
  const [eventForm, setEventForm] = useState<AdminOfferEventManageFormState>(defaultEventForm());
  const [miners, setMiners] = useState<AdminOfferEventMinerRow[]>([]);
  const [purchases, setPurchases] = useState<AdminOfferEventPurchaseRow[]>([]);
  const [purchaseStats, setPurchaseStats] = useState({ unitSales: 0, uniqueBuyers: 0, checkoutBatches: 0, revenuePol: 0 });
  const [showMinerForm, setShowMinerForm] = useState<boolean>(false);
  const [editingMinerId, setEditingMinerId] = useState<number | null>(null);
  const [minerForm, setMinerForm] = useState<AdminOfferEventMinerFormState>(defaultMinerForm());
  const [purchaseSearch, setPurchaseSearch] = useState('');

  /* loaders */
  const loadEvent = useCallback(async () => {
    if (isNew) return;
    try {
      setLoading(true);
      const res = await getAdminOfferEvent(routeId);
      if (res.data.ok && res.data.event) {
        const e = res.data.event;
        setEventData(e);
        setEventForm({
          title: e.title || '',
          description: e.description || '',
          imageUrl: e.imageUrl || '',
          startsAt: e.startsAt ? new Date(e.startsAt).toISOString().slice(0, 16) : '',
          endsAt: e.endsAt ? new Date(e.endsAt).toISOString().slice(0, 16) : '',
          isActive: !!e.isActive,
        });
      }
    } catch {
      toast.error('Evento não encontrado');
      navigate('/admin/offer-events');
    } finally {
      setLoading(false);
    }
  }, [routeId, isNew, navigate]);

  const loadMiners = useCallback(async () => {
    if (isNew) return;
    try {
      const res = await listAdminOfferEventMiners(routeId);
      if (res.data.ok) setMiners(res.data.miners || []);
    } catch {
      toast.error('Erro ao carregar miners');
    }
  }, [routeId, isNew]);

  const loadPurchases = useCallback(async () => {
    if (isNew) return;
    try {
      const res = await listAdminOfferEventPurchases(routeId);
      if (res.data.ok) {
        setPurchases(res.data.purchases || []);
        if ('stats' in res.data && res.data.stats) setPurchaseStats(res.data.stats);
      }
    } catch {
      toast.error('Erro ao carregar vendas');
    }
  }, [routeId, isNew]);

  useEffect(() => { void loadEvent(); }, [loadEvent]);
  useEffect(() => {
    if (tab === 'miners') void loadMiners();
    if (tab === 'sales') void loadPurchases();
  }, [tab, loadMiners, loadPurchases]);

  /* saves */
  const saveEvent = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    try {
      setSaving(true);
      const payload = {
        title: eventForm.title,
        description: eventForm.description,
        imageUrl: eventForm.imageUrl || null,
        startsAt: new Date(eventForm.startsAt).toISOString(),
        endsAt: new Date(eventForm.endsAt).toISOString(),
        isActive: eventForm.isActive,
      };
      if (isNew) {
        const res = await createAdminOfferEvent(payload);
        if (res.data.ok && res.data.event?.id != null) {
          toast.success('Evento criado!');
          navigate(`/admin/offer-events/${res.data.event.id}?tab=miners`);
        }
      } else {
        await updateAdminOfferEvent(routeId, payload);
        toast.success('Evento atualizado');
        void loadEvent();
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const openNewMiner = () => {
    setEditingMinerId(null);
    setMinerForm(defaultMinerForm());
    setShowMinerForm(true);
  };

  const openEditMiner = (m: AdminOfferEventMinerRow) => {
    setEditingMinerId(m.id);
    setMinerForm({
      name: m.name,
      description: m.description,
      imageUrl: m.imageUrl || '',
      price: String(m.price),
      hashRate: String(m.hashRate),
      currency: m.currency || 'POL',
      stockUnlimited: m.stockUnlimited,
      stockCount: m.stockCount != null ? String(m.stockCount) : '',
      slotSize: m.slotSize === 2 ? 2 : 1,
      isActive: m.isActive,
      isFree: m.isFree || false,
      claimLimitPerUser: m.claimLimitPerUser ?? 1,
    });
    setShowMinerForm(true);
  };

  const saveMiner = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isNew) return;
    try {
      setSaving(true);
      const payload = {
        name: minerForm.name,
        description: minerForm.description,
        imageUrl: minerForm.imageUrl || null,
        price: minerForm.isFree ? 0 : Number(minerForm.price),
        hashRate: Number(minerForm.hashRate),
        currency: minerForm.currency,
        stockUnlimited: minerForm.stockUnlimited,
        stockCount: minerForm.stockUnlimited ? null : Number(minerForm.stockCount),
        slotSize: Number(minerForm.slotSize),
        isActive: minerForm.isActive,
        isFree: minerForm.isFree,
        claimLimitPerUser: Number(minerForm.claimLimitPerUser),
      };
      if (editingMinerId) {
        await updateAdminOfferEventMiner(routeId, editingMinerId, payload);
        toast.success('Miner atualizado');
      } else {
        await createAdminOfferEventMiner(routeId, payload);
        toast.success('Miner criado');
      }
      setShowMinerForm(false);
      void loadMiners();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao salvar miner');
    } finally {
      setSaving(false);
    }
  };

  const removeMiner = async (minerId: number) => {
    if (!window.confirm('Remover este miner do evento?')) return;
    try {
      await deleteAdminOfferEventMiner(routeId, minerId);
      toast.success('Miner removido');
      void loadMiners();
    } catch {
      toast.error('Erro ao remover');
    }
  };

  const setTab = (t: AdminOfferEventManageTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', t);
    setSearchParams(next, { replace: true });
  };

  /* filtered purchases */
  const filteredPurchases = purchaseSearch.trim()
    ? purchases.filter((p) => {
        const q = purchaseSearch.toLowerCase();
        return (
          (p.user?.email ?? '').toLowerCase().includes(q) ||
          (p.user?.username ?? '').toLowerCase().includes(q) ||
          String(p.userId).includes(q) ||
          (p.minerName ?? '').toLowerCase().includes(q)
        );
      })
    : purchases;

  if (loading && !isNew) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
      </div>
    );
  }

  const inputCls =
    'w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-slate-600 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30';

  return (
    <>
      <div className="max-w-5xl space-y-6">
        {/* back + title */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => navigate('/admin/offer-events')}
              className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Eventos de Oferta
            </button>
            <h1 className="flex items-center gap-2 text-xl font-black text-white">
              <Tag className="h-5 w-5 text-amber-400" />
              {isNew ? 'Novo evento' : (eventData?.title ?? `Evento #${routeId}`)}
            </h1>
          </div>

          {!isNew && eventData && (
            <div className="flex items-center gap-2">
              {eventData.isActive ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Ativo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/30 bg-slate-500/10 px-2.5 py-1 text-[10px] font-black uppercase text-slate-400">
                  <XCircle className="h-3 w-3" /> Inativo
                </span>
              )}
            </div>
          )}
        </div>

        {/* stats summary (existing events) */}
        {!isNew && eventData?._count && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Miners', value: eventData._count.miners, icon: Cpu, color: 'amber' },
              { label: 'Vendas', value: eventData._count.purchases, icon: ShoppingBag, color: 'emerald' },
              { label: 'Compradores', value: purchaseStats.uniqueBuyers, icon: Users, color: 'sky' },
              { label: 'Receita POL', value: purchaseStats.revenuePol.toFixed(2), icon: TrendingUp, color: 'purple' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3">
                <Icon
                  className={`mb-1 h-4 w-4 ${color === 'amber' ? 'text-amber-400' : color === 'emerald' ? 'text-emerald-400' : color === 'sky' ? 'text-sky-400' : 'text-purple-400'}`}
                />
                <p className="text-lg font-black text-white">{value}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* tabs */}
        <div className="flex gap-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-1">
          {TAB_KEYS.map((t) => {
            const labels: Record<AdminOfferEventManageTab, string> = {
              event: 'Dados',
              miners: 'Miners',
              sales: 'Vendas',
            };
            const icons: Record<AdminOfferEventManageTab, React.ElementType> = {
              event: Tag,
              miners: Cpu,
              sales: Receipt,
            };
            const Icon = icons[t];
            return (
              <button
                key={t}
                type="button"
                disabled={isNew && t !== 'event'}
                onClick={() => setTab(t)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-black uppercase tracking-wider transition-all disabled:opacity-30 ${
                  tab === t
                    ? 'bg-amber-500/20 text-amber-400 shadow-sm'
                    : 'text-slate-500 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {labels[t]}
              </button>
            );
          })}
        </div>

        {/* ── TAB: event ── */}
        {tab === 'event' && (
          <form onSubmit={saveEvent} className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Título *</label>
              <input
                className={inputCls}
                placeholder="Ex: Mining Revolution"
                value={eventForm.title}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setEventForm((f) => ({ ...f, title: e.target.value }))
                }
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Descrição *</label>
              <textarea
                className={`${inputCls} min-h-[100px] resize-none`}
                placeholder="Descrição visível para os jogadores..."
                value={eventForm.description}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  setEventForm((f) => ({ ...f, description: e.target.value }))
                }
                required
              />
            </div>

            <ImageUploader
              label="Imagem do Evento"
              value={eventForm.imageUrl}
              onChange={(url: string) => setEventForm((f) => ({ ...f, imageUrl: url }))}
              previewClass="max-h-40"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Início (UTC) *</label>
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={eventForm.startsAt}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setEventForm((f) => ({ ...f, startsAt: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Fim (UTC) *</label>
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={eventForm.endsAt}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setEventForm((f) => ({ ...f, endsAt: e.target.value }))
                  }
                  required
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
              <div
                onClick={() => setEventForm((f) => ({ ...f, isActive: !f.isActive }))}
                className={`relative h-5 w-9 cursor-pointer rounded-full transition-colors ${eventForm.isActive ? 'bg-amber-500' : 'bg-slate-700'}`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${eventForm.isActive ? 'translate-x-4' : 'translate-x-0.5'}`}
                />
              </div>
              <span className="text-sm font-bold text-slate-300">
                {eventForm.isActive ? 'Evento ativo (visível na loja)' : 'Evento inativo (oculto)'}
              </span>
            </label>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-black text-slate-950 transition-all hover:brightness-110 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isNew ? 'Criar evento' : 'Salvar alterações'}
            </button>
          </form>
        )}

        {/* ── TAB: miners ── */}
        {tab === 'miners' && !isNew && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-black text-white">
                <Cpu className="h-4 w-4 text-amber-400" />
                Miners ({miners.length})
              </h2>
              <button
                type="button"
                onClick={openNewMiner}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-slate-950 transition-all hover:brightness-110"
              >
                <Plus className="h-4 w-4" />
                Adicionar miner
              </button>
            </div>

            {miners.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-16 text-center">
                <Cpu className="mb-2 h-10 w-10 text-slate-700" />
                <p className="font-bold text-slate-400">Nenhum miner adicionado</p>
                <p className="mt-1 text-xs text-slate-600">Clique em "Adicionar miner" para começar</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {miners.map((m) => (
                  <MinerCard
                    key={m.id}
                    miner={m}
                    onEdit={() => openEditMiner(m)}
                    onRemove={() => void removeMiner(m.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: sales ── */}
        {tab === 'sales' && !isNew && (
          <div className="space-y-5">
            {/* stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Unidades vendidas', value: purchaseStats.unitSales, icon: ShoppingBag, color: 'amber' },
                { label: 'Compradores únicos', value: purchaseStats.uniqueBuyers, icon: Users, color: 'sky' },
                { label: 'Checkouts', value: purchaseStats.checkoutBatches, icon: Package, color: 'slate' },
                { label: 'Receita POL', value: purchaseStats.revenuePol.toFixed(4), icon: TrendingUp, color: 'emerald' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3">
                  <Icon
                    className={`mb-1 h-4 w-4 ${color === 'amber' ? 'text-amber-400' : color === 'sky' ? 'text-sky-400' : color === 'emerald' ? 'text-emerald-400' : 'text-slate-400'}`}
                  />
                  <p className="text-lg font-black text-white">{value}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
                </div>
              ))}
            </div>

            {/* search */}
            <input
              className="w-full max-w-xs rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white placeholder:text-slate-600 focus:border-amber-500/40 focus:outline-none"
              placeholder="Buscar por e-mail, user ou miner..."
              value={purchaseSearch}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPurchaseSearch(e.target.value)}
            />

            {/* table */}
            <div className="overflow-hidden rounded-2xl border border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Usuário</th>
                    <th className="px-4 py-3">Miner</th>
                    <th className="px-4 py-3">Valor</th>
                    <th className="px-4 py-3">Data (UTC)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {filteredPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-600">
                        Nenhuma compra encontrada
                      </td>
                    </tr>
                  ) : (
                    filteredPurchases.map((p) => (
                      <tr key={p.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">#{p.id}</td>
                        <td className="px-4 py-3 text-xs">
                          <p className="font-bold text-white">
                            {p.user?.email ?? p.user?.username ?? `#${p.userId}`}
                          </p>
                          {p.user?.email && p.user.username && (
                            <p className="text-slate-500">{p.user.username}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">{p.minerName ?? '—'}</td>
                        <td className="px-4 py-3 font-mono">
                          <span
                            className={`rounded-full border px-1.5 py-0.5 text-[9px] font-black ${
                              p.currency === 'POL'
                                ? 'border-purple-500/30 bg-purple-500/10 text-purple-300'
                                : 'border-slate-700 bg-slate-800 text-slate-300'
                            }`}
                          >
                            {p.currency}
                          </span>{' '}
                          {Number(p.pricePaid).toFixed(4)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(p.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* miner form modal */}
      <MinerFormModal
        open={showMinerForm}
        editingId={editingMinerId}
        form={minerForm}
        saving={saving}
        onChange={(patch) => setMinerForm((f) => ({ ...f, ...patch }))}
        onSubmit={saveMiner}
        onClose={() => {
          setShowMinerForm(false);
          setEditingMinerId(null);
          setMinerForm(defaultMinerForm());
        }}
      />
    </>
  );
}
