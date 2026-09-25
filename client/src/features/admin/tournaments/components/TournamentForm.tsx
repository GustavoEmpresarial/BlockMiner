import { useState, useEffect, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  emptyForm,
  TOURNAMENT_METRICS,
  TOURNAMENT_TYPES,
  type TournamentFormState,
  type TournamentMetric,
  type TournamentType,
} from '../tournaments.admin.types';
import { TournamentPrizeEditor } from './TournamentPrizeEditor';

export interface TournamentFormProps {
  open: boolean;
  editId: number | null;
  initial?: TournamentFormState;
  onSave: (form: TournamentFormState) => void | Promise<void>;
  onClose: () => void;
  isSaving: boolean;
}

export function TournamentForm({
  open,
  editId,
  initial,
  onSave,
  onClose,
  isSaving,
}: TournamentFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<TournamentFormState>(() => initial ?? emptyForm());

  useEffect(() => {
    if (initial) setForm(initial);
    else setForm(emptyForm());
  }, [initial, open]);

  if (!open) return null;

  const field = <K extends keyof TournamentFormState>(k: K, v: TournamentFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error('O nome do torneio é obrigatório.');
      return;
    }

    const start = new Date(form.startsAt);
    const end = new Date(form.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error('Datas de início e fim inválidas.');
      return;
    }
    if (end <= start) {
      toast.error('A data de fim deve ser posterior à data de início.');
      return;
    }

    for (const p of form.prizes) {
      if (p.rankFrom < 1 || p.rankTo < p.rankFrom) {
        toast.error(t('adminTournaments.invalid_rank'));
        return;
      }
      if (p.prizeType === 'MACHINE' && !p.minerId) {
        toast.error(t('adminTournaments.miner_required'));
        return;
      }
    }

    await onSave(form);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tournament-form-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) {
          onClose();
        }
      }}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-amber-500/25 bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <h3 id="tournament-form-title" className="text-base font-black text-amber-200">
            {editId ? t('adminTournaments.edit_title') : t('adminTournaments.create_title')}
          </h3>
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50 transition-colors"
            aria-label={t('adminTournaments.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-[10px] font-black uppercase tracking-widest text-slate-400 md:col-span-2">
              {t('adminTournaments.name')} *
              <input
                required
                value={form.name}
                onChange={(e) => field('name', e.target.value)}
                placeholder="Ex: Torneio Diário de Ofertas"
                maxLength={100}
                className="input-admin w-full text-white"
              />
            </label>

            <label className="flex items-center gap-2 text-xs font-bold text-slate-300 md:col-span-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.recurring}
                onChange={(e) => field('recurring', e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500/30"
              />
              <span>{t('adminTournaments.recurring')}</span>
              <span className="text-[11px] font-normal text-slate-500">
                (clona automaticamente para o próximo ciclo ao finalizar)
              </span>
            </label>

            <label className="space-y-1 text-[10px] font-black uppercase tracking-widest text-slate-400 md:col-span-2">
              {t('adminTournaments.description')}
              <textarea
                value={form.description}
                onChange={(e) => field('description', e.target.value)}
                rows={2}
                placeholder="Regras ou informações adicionais para os participantes"
                className="input-admin w-full text-white resize-none"
              />
            </label>

            <label className="space-y-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              {t('adminTournaments.type')}
              <select
                value={form.type}
                onChange={(e) => field('type', e.target.value as TournamentType)}
                className="input-admin w-full text-white"
              >
                {TOURNAMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              {t('adminTournaments.metric')}
              <select
                value={form.metric}
                onChange={(e) => field('metric', e.target.value as TournamentMetric)}
                className="input-admin w-full text-white"
              >
                {TOURNAMENT_METRICS.map((metric) => (
                  <option key={metric} value={metric}>
                    {metric}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              {t('adminTournaments.starts')} (Horário Local) *
              <input
                required
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => field('startsAt', e.target.value)}
                className="input-admin w-full text-white"
              />
            </label>

            <label className="space-y-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              {t('adminTournaments.ends')} (Horário Local) *
              <input
                required
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => field('endsAt', e.target.value)}
                className="input-admin w-full text-white"
              />
            </label>

            {form.type !== 'CUSTOM' ? (
              <p className="text-[11px] leading-snug text-slate-500 md:col-span-2">
                {t('adminTournaments.window_snap_hint')}
              </p>
            ) : null}

            <div className="md:col-span-2 pt-2 border-t border-slate-800">
              <TournamentPrizeEditor
                prizes={form.prizes}
                onChange={(prizes) => field('prizes', prizes)}
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-slate-800 px-5 py-4 bg-slate-950/60">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2.5 text-xs font-black text-slate-950 disabled:opacity-50 transition-colors shadow-md shadow-amber-500/10"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('adminManaged.saving')}
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                {editId ? t('adminManaged.update') : t('adminManaged.create')}
              </>
            )}
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="rounded-xl border border-slate-700 hover:border-slate-600 px-4 py-2.5 text-xs font-bold text-slate-300 transition-colors disabled:opacity-50"
          >
            {t('adminTournaments.close')}
          </button>
        </div>
      </form>
    </div>
  );
}
