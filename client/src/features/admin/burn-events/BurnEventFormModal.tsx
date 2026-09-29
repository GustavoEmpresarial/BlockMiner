import { useState, useEffect, type FormEvent } from 'react';
import { X, Loader2, CheckCircle2, Flame, Award, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { adminBurnEventsApi } from './adminBurnEvents.api';
import type { AdminBurnEventRow, AdminCreateBurnEventPayload, AdminUpdateBurnEventPayload, CatalogMiner } from './adminBurnEvents.types';
import { readAxiosResponseMessage } from '../lib/admin.api';

interface BurnEventFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  event?: AdminBurnEventRow | null;
  miners: CatalogMiner[];
}

export function BurnEventFormModal({ isOpen, onClose, onSaved, event, miners }: BurnEventFormModalProps) {
  const isEdit = Boolean(event?.id);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [requiredHashRate, setRequiredHashRate] = useState<string | number>(100);
  const [rewardMinerId, setRewardMinerId] = useState<number | ''>('');
  const [claimLimitPerUser, setClaimLimitPerUser] = useState<string | number>(10);
  const [stockTotal, setStockTotal] = useState<string>('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (event) {
      setTitle(event.title || '');
      setDescription(event.description || '');
      setImageUrl(event.imageUrl || '');
      setRequiredHashRate(event.requiredHashRate ?? 100);
      setRewardMinerId(event.rewardMinerId || '');
      setClaimLimitPerUser(event.claimLimitPerUser ?? 10);
      setStockTotal(event.stockTotal != null ? String(event.stockTotal) : '');
      setStartsAt(event.startsAt ? new Date(event.startsAt).toISOString().slice(0, 16) : '');
      setEndsAt(event.endsAt ? new Date(event.endsAt).toISOString().slice(0, 16) : '');
      setIsActive(event.isActive !== false);
    } else {
      setTitle('');
      setDescription('');
      setImageUrl('');
      setRequiredHashRate(100);
      setRewardMinerId(miners[0]?.id || '');
      setClaimLimitPerUser(10);
      setStockTotal('');
      setStartsAt('');
      setEndsAt('');
      setIsActive(true);
    }
  }, [event, isOpen, miners]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('O título do evento é obrigatório.');
      return;
    }
    if (!rewardMinerId) {
      toast.error('Selecione a máquina-prêmio concedida na queima.');
      return;
    }

    const numHash = Number(requiredHashRate);
    if (!Number.isFinite(numHash) || numHash <= 0) {
      toast.error('O hashrate exigido deve ser um valor numérico maior que zero.');
      return;
    }

    const numClaimLimit = parseInt(String(claimLimitPerUser), 10);
    if (!Number.isFinite(numClaimLimit) || numClaimLimit < 1) {
      toast.error('O limite de queimas por usuário deve ser de pelo menos 1.');
      return;
    }

    setSaving(true);
    try {
      if (isEdit && event?.id) {
        const payload: AdminUpdateBurnEventPayload = {
          title: title.trim(),
          description: description.trim() || null,
          imageUrl: imageUrl.trim() || null,
          requiredHashRate: numHash,
          rewardMinerId: Number(rewardMinerId),
          claimLimitPerUser: numClaimLimit,
          stockTotal: stockTotal.trim() === '' ? null : parseInt(stockTotal, 10),
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          isActive,
        };
        const res = await adminBurnEventsApi.update(event.id, payload);
        if (res.data.ok) {
          toast.success('Evento de queima atualizado com sucesso!');
          onSaved();
          onClose();
        } else {
          toast.error(res.data.message || 'Erro ao atualizar evento de queima.');
        }
      } else {
        const payload: AdminCreateBurnEventPayload = {
          title: title.trim(),
          description: description.trim() || undefined,
          imageUrl: imageUrl.trim() || undefined,
          requiredHashRate: numHash,
          rewardMinerId: Number(rewardMinerId),
          claimLimitPerUser: numClaimLimit,
          stockTotal: stockTotal.trim() === '' ? null : parseInt(stockTotal, 10),
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          isActive,
        };
        const res = await adminBurnEventsApi.create(payload);
        if (res.data.ok) {
          toast.success('Novo evento de queima criado com sucesso!');
          onSaved();
          onClose();
        } else {
          toast.error(res.data.message || 'Erro ao criar evento de queima.');
        }
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao salvar evento de queima.');
    } finally {
      setSaving(false);
    }
  };

  const selectedMiner = miners.find((m) => m.id === Number(rewardMinerId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 shadow-2xl p-6 my-8">
        <header className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-400">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">
                {isEdit ? `Editar Evento: ${event?.title}` : 'Criar Novo Evento de Queima'}
              </h2>
              <p className="text-xs text-slate-400">
                {isEdit
                  ? 'Modifique os requisitos de poder, limites ou máquina concedida.'
                  : 'Configure um novo evento para queima de máquinas no ecossistema.'}
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

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Título do Evento *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Queima de Inverno — Cyber Forge"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-orange-500/60 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Banner Promocional (URL)</label>
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-orange-500/60 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Descrição Explicativa</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva as instruções ou lore do evento de queima..."
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2 text-sm text-white focus:border-orange-500/60 focus:outline-none resize-none"
            />
          </div>

          {/* Recompensa e Hashrate */}
          <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-4 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              <Award className="h-4 w-4 text-emerald-400" />
              <span>Regras de Troca & Máquina-Prêmio</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Máquina-Prêmio Concedida *</label>
                <select
                  required
                  value={rewardMinerId}
                  onChange={(e) => setRewardMinerId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2.5 text-sm text-white focus:border-orange-500/60 focus:outline-none"
                >
                  <option value="">— Selecione uma máquina —</option>
                  {miners.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.baseHashRate.toLocaleString('pt-BR')} H/s)
                    </option>
                  ))}
                </select>
                {selectedMiner && (
                  <p className="text-[11px] text-emerald-400/90 mt-1.5">
                    Máquina selecionada: <strong>{selectedMiner.name}</strong> · {selectedMiner.slotSize} slot(s)
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Poder Exigido (H/s a queimar) *</label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min={1}
                    step="any"
                    value={requiredHashRate}
                    onChange={(e) => setRequiredHashRate(e.target.value)}
                    placeholder="Ex: 5000000"
                    className="w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2.5 text-sm font-mono text-orange-400 focus:border-orange-500/60 focus:outline-none"
                  />
                  <Zap className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-500/50" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  O jogador deve selecionar máquinas que somem pelo menos este valor em hashrate.
                </p>
              </div>
            </div>
          </div>

          {/* Limites de Estoque e Usuário */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Limite de Queimas por Usuário *</label>
              <input
                type="number"
                required
                min={1}
                value={claimLimitPerUser}
                onChange={(e) => setClaimLimitPerUser(e.target.value)}
                placeholder="Ex: 10"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-white focus:border-orange-500/60 focus:outline-none"
              />
              <p className="text-[11px] text-slate-500 mt-1">Quantas vezes cada jogador pode completar esta queima.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Estoque Global Total <span className="text-slate-500 font-normal">(Vazio = Ilimitado)</span>
              </label>
              <input
                type="number"
                min={1}
                value={stockTotal}
                onChange={(e) => setStockTotal(e.target.value)}
                placeholder="Ilimitado"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-white focus:border-orange-500/60 focus:outline-none"
              />
              <p className="text-[11px] text-slate-500 mt-1">Capacidade total de prêmios distribuídos em todo o jogo.</p>
            </div>
          </div>

          {/* Datas de Vigência */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Data de Início <span className="text-slate-500 font-normal">(Opcional)</span>
              </label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:border-orange-500/60 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Data de Término <span className="text-slate-500 font-normal">(Opcional)</span>
              </label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:border-orange-500/60 focus:outline-none"
              />
            </div>
          </div>

          {/* Ativo */}
          <label className="flex items-center justify-between p-3.5 rounded-2xl border border-white/10 bg-slate-950/60 cursor-pointer">
            <div>
              <span className="text-xs font-bold text-white block">Evento Ativo</span>
              <span className="text-[11px] text-slate-400 block">Exibe o evento no hub de queimas (/burn) para os jogadores</span>
            </div>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded accent-orange-500"
            />
          </label>

          <footer className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-slate-800 px-5 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-400 shadow-lg shadow-orange-500/20 disabled:opacity-50 transition"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              <span>{saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Evento'}</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
