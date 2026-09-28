import { useState } from 'react';
import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Edit3,
  Gamepad2,
  Layers,
  ListChecks,
  Loader2,
  Pickaxe,
  Plus,
  Save,
  Sparkles,
  Target,
  Trash2,
  X,
  Youtube,
} from 'lucide-react';
import type {
  AdminDailyTaskDefinitionRow,
  CreateFormState,
  EditFormState,
  QuickTemplateId,
} from './adminDailyTasksModel';
import {
  TASK_TYPES,
  REWARD_KINDS,
  RESET_CADENCES,
  applyQuickTemplate,
  coerceTargetWhenSwitchingTaskType,
  formatRewardSummary,
  isCountTaskType,
} from './adminDailyTasksModel';
import { QUICK_TEMPLATES } from '../adminDailyTasks.shared';

type T = TFunction;

export function CreateTaskForm(props: {
  t: T;
  createForm: CreateFormState;
  setCreateForm: (v: CreateFormState) => void;
  targetFieldLabelKey: string;
  creating: boolean;
  setShowCreate: (v: boolean) => void;
  onCreate: () => void;
}) {
  const { t, createForm, setCreateForm, targetFieldLabelKey, creating, setShowCreate, onCreate } = props;

  function onTemplateSelect(tplId: QuickTemplateId) {
    setCreateForm(applyQuickTemplate(tplId, createForm));
  }

  function handleTypeChange(nextType: string) {
    const nextTarget = coerceTargetWhenSwitchingTaskType(createForm.taskType, nextType, createForm.targetValue);
    setCreateForm({ ...createForm, taskType: nextType, targetValue: nextTarget });
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-slate-900/90 p-6 space-y-6 shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-400">
            <Plus className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wider text-white">
              {t('admin_daily_tasks.create_title', 'Nova Definição de Tarefa')}
            </h2>
            <p className="text-xs text-slate-400">
              {t('admin_daily_tasks.create_desc', 'Configure as metas, cadência de reset e prêmios para os jogadores.')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(false)}
          className="rounded-xl p-2 text-slate-400 hover:bg-white/5 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Quick Templates */}
      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          {t('admin_daily_tasks.presets', 'Modelos Rápidos (Preenchimento Automático)')}
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {QUICK_TEMPLATES.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onTemplateSelect(tpl.id)}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-3 text-center transition-colors hover:border-amber-500/40 hover:bg-amber-500/10"
              >
                <Icon className="h-5 w-5 text-amber-400" />
                <span className="text-xs font-bold text-white leading-tight">{t(tpl.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onCreate();
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Slug */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
              Slug (Identificador Único) *
            </label>
            <input
              type="text"
              required
              value={createForm.slug}
              onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
              placeholder="ex: daily-mine-1-blk"
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-mono text-white focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Task Type */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
              Tipo de Tarefa *
            </label>
            <select
              value={createForm.taskType}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
            >
              {TASK_TYPES.map((tt) => (
                <option key={tt} value={tt}>
                  {tt}
                </option>
              ))}
            </select>
          </div>

          {/* Cadence */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
              Cadência de Reset *
            </label>
            <select
              value={createForm.resetCadence}
              onChange={(e) => setCreateForm({ ...createForm, resetCadence: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
            >
              {RESET_CADENCES.map((rc) => (
                <option key={rc} value={rc}>
                  {rc}
                </option>
              ))}
            </select>
          </div>

          {/* Target Value */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
              {t(targetFieldLabelKey, 'Meta / Quantidade')} *
            </label>
            <input
              type="number"
              step={isCountTaskType(createForm.taskType) ? '1' : '0.0001'}
              min="0.0001"
              required
              value={createForm.targetValue}
              onChange={(e) => setCreateForm({ ...createForm, targetValue: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-mono text-white focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Reward Kind */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
              Tipo de Recompensa *
            </label>
            <select
              value={createForm.rewardKind}
              onChange={(e) => setCreateForm({ ...createForm, rewardKind: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
            >
              {REWARD_KINDS.map((rk) => (
                <option key={rk} value={rk}>
                  {rk}
                </option>
              ))}
            </select>
          </div>

          {/* Dynamic Reward Field */}
          {createForm.rewardKind === 'BLK' && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                Valor em BLK *
              </label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                required
                value={createForm.rewardBlkAmount}
                onChange={(e) => setCreateForm({ ...createForm, rewardBlkAmount: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-mono text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
          )}

          {createForm.rewardKind === 'POL' && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                Valor em POL *
              </label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                required
                value={createForm.rewardPolAmount}
                onChange={(e) => setCreateForm({ ...createForm, rewardPolAmount: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-mono text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
          )}

          {createForm.rewardKind === 'HASHRATE_TEMP' && (
            <>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                  Poder (H/s) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  required
                  value={createForm.rewardHashRate}
                  onChange={(e) => setCreateForm({ ...createForm, rewardHashRate: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-mono text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                  Duração em Dias *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={createForm.rewardHashRateDays}
                  onChange={(e) => setCreateForm({ ...createForm, rewardHashRateDays: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-mono text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
            </>
          )}

          {createForm.rewardKind === 'SHOP_MINER' && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                ID da Mineradora da Loja (Miner ID) *
              </label>
              <input
                type="number"
                min="1"
                required
                value={createForm.rewardMinerId}
                onChange={(e) => setCreateForm({ ...createForm, rewardMinerId: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-mono text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
          )}

          {createForm.rewardKind === 'EVENT_MINER' && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                ID da Mineradora de Evento *
              </label>
              <input
                type="number"
                min="1"
                required
                value={createForm.rewardEventMinerId}
                onChange={(e) => setCreateForm({ ...createForm, rewardEventMinerId: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-mono text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
          )}

          {/* Translation Key */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
              Chave de Tradução *
            </label>
            <input
              type="text"
              required
              value={createForm.translationKey}
              onChange={(e) => setCreateForm({ ...createForm, translationKey: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Scopes */}
          {createForm.taskType === 'PLAY_GAMES' && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                Slug do Jogo (Opcional - Vazio = Qualquer Jogo)
              </label>
              <input
                type="text"
                value={createForm.gameSlug}
                onChange={(e) => setCreateForm({ ...createForm, gameSlug: e.target.value })}
                placeholder="ex: game2048"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-mono text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
          )}

          {createForm.taskType === 'INTERNAL_OFFERWALL' && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                ID da Oferta Interna (Opcional)
              </label>
              <input
                type="number"
                min="1"
                value={createForm.internalOfferwallOfferId}
                onChange={(e) => setCreateForm({ ...createForm, internalOfferwallOfferId: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-mono text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-4 border-t border-white/10">
          <button
            type="submit"
            disabled={creating}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-black uppercase tracking-wider text-slate-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('admin_daily_tasks.btn_create', 'Criar Tarefa')}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 bg-slate-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-700"
          >
            {t('common.cancel', 'Cancelar')}
          </button>
        </div>
      </form>
    </div>
  );
}

export function EditTaskForm(props: {
  t: T;
  editingRow: AdminDailyTaskDefinitionRow;
  editForm: EditFormState;
  setEditForm: (v: EditFormState) => void;
  saving: boolean;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
}) {
  const { t, editingRow, editForm, setEditForm, saving, onCancelEdit, onSaveEdit } = props;

  return (
    <div className="rounded-2xl border border-sky-500/30 bg-slate-900/90 p-6 space-y-6 shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-sky-500/10 p-2.5 text-sky-400">
            <Edit3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wider text-white">
              Editar Tarefa: <span className="font-mono text-sky-400">{editingRow.slug}</span>
            </h2>
            <p className="text-xs text-slate-400">Altere os parâmetros da tarefa existente.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancelEdit}
          className="rounded-xl p-2 text-slate-400 hover:bg-white/5 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSaveEdit();
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
              Meta / Target Value *
            </label>
            <input
              type="number"
              step={isCountTaskType(editForm.taskType) ? '1' : '0.0001'}
              min="0.0001"
              required
              value={editForm.targetValue}
              onChange={(e) => setEditForm({ ...editForm, targetValue: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-mono text-white focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
              Cadência de Reset *
            </label>
            <select
              value={editForm.resetCadence}
              onChange={(e) => setEditForm({ ...editForm, resetCadence: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-bold text-white focus:border-sky-500 focus:outline-none"
            >
              {RESET_CADENCES.map((rc) => (
                <option key={rc} value={rc}>
                  {rc}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
              Ordem de Exibição
            </label>
            <input
              type="number"
              value={editForm.sortOrder}
              onChange={(e) => setEditForm({ ...editForm, sortOrder: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm font-mono text-white focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 pt-5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ativo no Sistema</label>
            <button
              type="button"
              onClick={() => setEditForm({ ...editForm, isActive: !editForm.isActive })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                editForm.isActive ? 'bg-emerald-600' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  editForm.isActive ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-4 border-t border-white/10">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sky-500 px-6 py-2.5 text-sm font-black uppercase tracking-wider text-slate-950 hover:bg-sky-400 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('common.save', 'Salvar Alterações')}
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 bg-slate-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-700"
          >
            {t('common.cancel', 'Cancelar')}
          </button>
        </div>
      </form>
    </div>
  );
}

export function DefinitionsTable(props: {
  t: T;
  rows: AdminDailyTaskDefinitionRow[];
  patching: Record<number, boolean>;
  orderDraft: Record<number, string>;
  setOrderDraft: (v: Record<number, string>) => void;
  saving: boolean;
  editingRow: AdminDailyTaskDefinitionRow | null;
  deletingId: number | null;
  onToggleActive: (id: number, isActive: boolean) => void;
  onCadenceChange: (id: number, next: string, prev: string | null | undefined) => void;
  onSaveOrder: (id: number) => void;
  onStartEdit: (row: AdminDailyTaskDefinitionRow) => void;
  onDelete: (id: number, slug: string) => void;
}) {
  const {
    rows,
    patching,
    orderDraft,
    setOrderDraft,
    editingRow,
    deletingId,
    onToggleActive,
    onCadenceChange,
    onSaveOrder,
    onStartEdit,
    onDelete,
  } = props;

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-12 text-center space-y-3">
        <ListChecks className="h-10 w-10 text-slate-500 mx-auto" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">
          Nenhuma tarefa cadastrada no momento
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/60 shadow-xl">
      <table className="min-w-full text-sm">
        <thead className="border-b border-white/10 bg-slate-950/80 text-[10px] uppercase font-black tracking-widest text-slate-400">
          <tr>
            <th className="px-5 py-3.5 text-left">Ordem</th>
            <th className="px-5 py-3.5 text-left">Slug / Identificador</th>
            <th className="px-5 py-3.5 text-left">Tipo</th>
            <th className="px-5 py-3.5 text-left">Cadência</th>
            <th className="px-5 py-3.5 text-left">Meta</th>
            <th className="px-5 py-3.5 text-left">Recompensa</th>
            <th className="px-5 py-3.5 text-left">Status</th>
            <th className="px-5 py-3.5 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 font-medium">
          {rows.map((r) => {
            const isPatching = Boolean(patching[r.id]);
            const isDeleting = deletingId === r.id;
            const isEditing = editingRow?.id === r.id;
            const isActive = r.isActive !== false;

            return (
              <tr
                key={r.id}
                className={`transition-colors hover:bg-white/[0.02] ${
                  isEditing ? 'bg-sky-500/5' : ''
                }`}
              >
                {/* Sort Order */}
                <td className="px-5 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 w-24">
                    <input
                      type="number"
                      value={orderDraft[r.id] ?? r.sortOrder ?? 0}
                      onChange={(e) =>
                        setOrderDraft({ ...orderDraft, [r.id]: e.target.value })
                      }
                      className="w-14 rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs font-mono text-white text-center focus:border-amber-500 focus:outline-none"
                    />
                    {orderDraft[r.id] !== undefined &&
                      orderDraft[r.id] !== String(r.sortOrder ?? 0) && (
                        <button
                          type="button"
                          onClick={() => onSaveOrder(r.id)}
                          className="rounded-lg bg-amber-500/20 p-1 text-amber-400 hover:bg-amber-500/30"
                          title="Salvar ordem"
                        >
                          <Save className="h-3.5 w-3.5" />
                        </button>
                      )}
                  </div>
                </td>

                {/* Slug */}
                <td className="px-5 py-4">
                  <span className="font-mono text-sm font-bold text-white block truncate max-w-[200px]">
                    {r.slug}
                  </span>
                  <span className="text-[10px] text-slate-500 truncate block max-w-[200px]">
                    {r.translationKey}
                  </span>
                </td>

                {/* Task Type */}
                <td className="px-5 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-200">
                    {r.taskType === 'LOGIN_DAY' && <CalendarCheck className="h-3 w-3 text-amber-400" />}
                    {r.taskType === 'PLAY_GAMES' && <Gamepad2 className="h-3 w-3 text-sky-400" />}
                    {r.taskType === 'MINE_BLK' && <Pickaxe className="h-3 w-3 text-emerald-400" />}
                    {r.taskType === 'WATCH_YOUTUBE' && <Youtube className="h-3 w-3 text-red-400" />}
                    {r.taskType === 'INTERNAL_OFFERWALL' && <Layers className="h-3 w-3 text-purple-400" />}
                    {r.taskType}
                  </span>
                </td>

                {/* Reset Cadence */}
                <td className="px-5 py-4 whitespace-nowrap">
                  <select
                    value={r.resetCadence || 'DAILY'}
                    disabled={isPatching}
                    onChange={(e) => onCadenceChange(r.id, e.target.value, r.resetCadence)}
                    className="rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1 text-xs font-bold uppercase text-slate-300 focus:border-amber-500 focus:outline-none disabled:opacity-50"
                  >
                    {RESET_CADENCES.map((rc) => (
                      <option key={rc} value={rc}>
                        {rc}
                      </option>
                    ))}
                  </select>
                </td>

                {/* Target Value */}
                <td className="px-5 py-4 whitespace-nowrap font-mono text-sm text-slate-200">
                  {Number(r.targetValue)}
                </td>

                {/* Reward Summary */}
                <td className="px-5 py-4 whitespace-nowrap">
                  <span className="font-bold text-emerald-400 text-xs">
                    {formatRewardSummary(r)}
                  </span>
                </td>

                {/* Active Toggle Switch */}
                <td className="px-5 py-4 whitespace-nowrap">
                  <button
                    type="button"
                    disabled={isPatching}
                    onClick={() => onToggleActive(r.id, !isActive)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                      isActive ? 'bg-emerald-600' : 'bg-slate-700'
                    }`}
                    title={isActive ? 'Desativar tarefa' : 'Ativar tarefa'}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isActive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </td>

                {/* Action Buttons */}
                <td className="px-5 py-4 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onStartEdit(r)}
                      disabled={isPatching || isDeleting}
                      className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-2 text-sky-400 hover:bg-sky-500/20 disabled:opacity-50"
                      title="Editar definição"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>

                    {confirmDeleteId === r.id ? (
                      <div className="flex items-center gap-1.5 animate-in fade-in">
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => {
                            setConfirmDeleteId(null);
                            onDelete(r.id, r.slug);
                          }}
                          className="rounded-xl bg-red-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
                        >
                          {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirmar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-xl border border-white/10 bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(r.id)}
                        disabled={isPatching || isDeleting}
                        className="rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                        title="Excluir definição"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
