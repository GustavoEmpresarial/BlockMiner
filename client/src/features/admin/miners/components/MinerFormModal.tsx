import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { X, Upload, Loader2, Cpu, Tag, Image as ImageIcon, CheckCircle2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { adminMinersApi } from '../adminMiners.api';
import type { AdminMinerListRow, CreateMinerInput, UpdateMinerInput } from '../adminMiners.types';
import AdminMinerImage from './AdminMinerImage';
import { readAxiosResponseMessage } from '../../lib/admin.api';

interface MinerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  miner?: AdminMinerListRow | null;
}

const TIERS = [
  { value: 'common', label: 'Comum (Common)', color: 'text-slate-400 border-slate-700 bg-slate-900' },
  { value: 'rare', label: 'Raro (Rare)', color: 'text-blue-400 border-blue-700 bg-blue-950/40' },
  { value: 'epic', label: 'Épico (Epic)', color: 'text-purple-400 border-purple-700 bg-purple-950/40' },
  { value: 'legendary', label: 'Lendário (Legendary)', color: 'text-amber-400 border-amber-700 bg-amber-950/40' },
];

const SOURCE_TYPES = [
  { value: 'store', label: 'Loja (Store)' },
  { value: 'event', label: 'Evento (Event)' },
  { value: 'faucet', label: 'Faucet / Genesis' },
  { value: 'reward', label: 'Recompensa Especial' },
];

export function MinerFormModal({ isOpen, onClose, onSaved, miner }: MinerFormModalProps) {
  const isEdit = Boolean(miner?.id);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [baseHashRate, setBaseHashRate] = useState<string | number>('1000000');
  const [price, setPrice] = useState<string | number>('1.5');
  const [slotSize, setSlotSize] = useState<number>(1);
  const [imageUrl, setImageUrl] = useState('');
  const [tier, setTier] = useState('common');
  const [sourceType, setSourceType] = useState('store');
  const [isActive, setIsActive] = useState(true);
  const [showInShop, setShowInShop] = useState(true);
  const [sortOrder, setSortOrder] = useState<string | number>('0');

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (miner) {
      setName(miner.name || '');
      setSlug(miner.slug || '');
      setDescription(miner.description || '');
      setBaseHashRate(miner.baseHashRate ?? miner.hashRate ?? '0');
      setPrice(miner.price ?? '0.5');
      setSlotSize(Number(miner.slotSize) === 2 ? 2 : 1);
      setImageUrl(miner.imageUrl || '');
      setTier(miner.tier || 'common');
      setSourceType(miner.sourceType || 'store');
      setIsActive(miner.isActive !== false);
      setShowInShop(miner.showInShop !== false);
      setSortOrder(miner.sortOrder != null ? String(miner.sortOrder) : '0');
    } else {
      setName('');
      setSlug('');
      setDescription('');
      setBaseHashRate('1000000');
      setPrice('1.5');
      setSlotSize(1);
      setImageUrl('');
      setTier('common');
      setSourceType('store');
      setIsActive(true);
      setShowInShop(true);
      setSortOrder('0');
    }
  }, [miner, isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione um arquivo de imagem válido (PNG, JPG, WEBP).');
      return;
    }

    setUploading(true);
    try {
      const url = await adminMinersApi.uploadImage(file);
      setImageUrl(url);
      toast.success('Imagem enviada com sucesso!');
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || 'Falha ao enviar imagem.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('O nome da mineradora é obrigatório.');
      return;
    }

    const numHash = Number(baseHashRate);
    if (!Number.isFinite(numHash) || numHash < 0) {
      toast.error('O hashrate deve ser um número maior ou igual a zero.');
      return;
    }

    const numPrice = Number(price);
    if (!Number.isFinite(numPrice) || numPrice < 0) {
      toast.error('O preço deve ser um valor numérico maior ou igual a zero.');
      return;
    }

    setSaving(true);
    try {
      if (isEdit && miner?.id) {
        const payload: UpdateMinerInput = {
          name: name.trim(),
          slug: slug.trim() || undefined,
          description: description.trim() || null,
          baseHashRate: numHash,
          price: numPrice,
          slotSize,
          imageUrl: imageUrl.trim() || null,
          tier,
          sourceType,
          isActive,
          showInShop,
          sortOrder: Number(sortOrder) || 0,
        };
        const res = await adminMinersApi.update(miner.id, payload);
        if (res.data.ok) {
          toast.success('Mineradora atualizada com sucesso!');
          onSaved();
          onClose();
        } else {
          toast.error(res.data.message || 'Erro ao atualizar mineradora.');
        }
      } else {
        const payload: CreateMinerInput = {
          name: name.trim(),
          slug: slug.trim() || undefined,
          description: description.trim() || null,
          baseHashRate: numHash,
          price: numPrice,
          slotSize,
          imageUrl: imageUrl.trim() || null,
          tier,
          sourceType,
          isActive,
          showInShop,
          sortOrder: Number(sortOrder) || 0,
        };
        const res = await adminMinersApi.create(payload);
        if (res.data.ok) {
          toast.success('Nova mineradora criada com sucesso!');
          onSaved();
          onClose();
        } else {
          toast.error(res.data.message || 'Erro ao criar mineradora.');
        }
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao salvar mineradora.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 shadow-2xl p-6 my-8">
        <header className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">
                {isEdit ? `Editar Mineradora: ${miner?.name}` : 'Cadastrar Nova Mineradora'}
              </h2>
              <p className="text-xs text-slate-400">
                {isEdit
                  ? 'Atualize parâmetros de potência, preço e disponibilidade.'
                  : 'Adicione uma nova máquina ao catálogo geral.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Nome da Máquina *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Antminer S19 Pro 110TH"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Slug Identificador <span className="text-slate-500 font-normal">(Opcional)</span>
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="Ex: antminer-s19-pro"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-amber-300/90 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Descrição</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Breve descrição dos atributos da máquina..."
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Poder Base (H/s) *</label>
              <input
                type="number"
                required
                min={0}
                step="any"
                value={baseHashRate}
                onChange={(e) => setBaseHashRate(e.target.value)}
                placeholder="Ex: 1000000"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-white focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Preço (POL) *</label>
              <input
                type="number"
                required
                min={0}
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Ex: 5.0"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-emerald-400 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Tamanho no Rack</label>
              <select
                value={slotSize}
                onChange={(e) => setSlotSize(Number(e.target.value))}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
              >
                <option value={1}>1 Slot (Padrão)</option>
                <option value={2}>2 Slots (Dupla)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Tier de Raridade</label>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
              >
                {TIERS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Tipo de Origem</label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
              >
                {SOURCE_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Ordem de Exibição</label>
              <input
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-white focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Imagem e Preview */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-300">Imagem da Mineradora</label>
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <div className="w-32 h-32 shrink-0 rounded-2xl border border-white/10 bg-slate-950 overflow-hidden flex items-center justify-center p-2">
                <AdminMinerImage imageUrl={imageUrl} variant="form" alt={name || 'Miner'} />
              </div>
              <div className="flex-1 space-y-3 w-full">
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="URL direta da imagem ou envie abaixo..."
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2 text-xs text-slate-300 focus:border-amber-400 focus:outline-none"
                />
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700">
                    <Upload className="h-4 w-4" />
                    <span>{uploading ? 'Enviando...' : 'Enviar Arquivo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploading}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin text-amber-400" /> : null}
                </div>
              </div>
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/10">
            <label className="flex items-center justify-between p-3.5 rounded-2xl border border-white/10 bg-slate-950/60 cursor-pointer">
              <div>
                <span className="text-xs font-bold text-white block">Mineradora Ativa</span>
                <span className="text-[11px] text-slate-400 block">Permite mineração pelos jogadores</span>
              </div>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded accent-amber-500"
              />
            </label>

            <label className="flex items-center justify-between p-3.5 rounded-2xl border border-white/10 bg-slate-950/60 cursor-pointer">
              <div>
                <span className="text-xs font-bold text-white block">Exibir na Loja</span>
                <span className="text-[11px] text-slate-400 block">Disponível para compra pública (/shop)</span>
              </div>
              <input
                type="checkbox"
                checked={showInShop}
                onChange={(e) => setShowInShop(e.target.checked)}
                className="h-4 w-4 rounded accent-amber-500"
              />
            </label>
          </div>

          <footer className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-slate-800 px-5 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              <span>{saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Mineradora'}</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
