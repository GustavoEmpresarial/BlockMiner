import type { Dispatch, SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import {
  Check,
  Coins,
  Globe,
  Loader2,
  Pencil,
  ShieldCheck,
  Sparkles,
  TimerReset,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import {
  KIND_GEN,
  KIND_PTC,
  OFFER_PRESETS,
  currentRewardSummary,
  rewardSummary,
} from './adminInternalOfferwall.shared';
import type {
  InternalOfferwallAttemptRow,
  InternalOfferwallFormState,
  InternalOfferwallOfferRow,
} from './adminInternalOfferwall.shared';

type OfferFormProps = {
  t: TFunction;
  form: InternalOfferwallFormState;
  setForm: Dispatch<SetStateAction<InternalOfferwallFormState>>;
  editingId: number | null;
  saving: boolean;
  onSave: () => Promise<void>;
  onClose: () => void;
};

export function OfferForm({
  t,
  form,
  setForm,
  editingId,
  saving,
  onSave,
  onClose,
}: OfferFormProps) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-white">{editingId ? t('admin_internal_offerwall.edit') : t('admin_internal_offerwall.create')}</h2>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sky-300">
          <Sparkles className="h-4 w-4" />
          <p className="text-sm font-black uppercase tracking-wider">Presets rápidos</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {OFFER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setForm((f) => preset.apply({ ...f }))}
              className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-left hover:border-sky-500/40 hover:bg-slate-900"
            >
              <p className="text-sm font-black text-white">{preset.label}</p>
              <p className="mt-1 text-xs text-slate-400">{preset.hint}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_kind')}</span>
            <select
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value={KIND_PTC}>PTC_IFRAME</option>
              <option value={KIND_GEN}>GENERAL_TASK</option>
            </select>
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_title')}</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block space-y-1 sm:col-span-3">
            <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_description')}</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          {form.kind === KIND_PTC ? (
            <label className="block space-y-1 sm:col-span-3">
              <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_iframe_url')}</span>
              <input
                value={form.iframeUrl}
                onChange={(e) => setForm((f) => ({ ...f, iframeUrl: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
              />
            </label>
          ) : null}
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_min_view')}</span>
            <input
              type="number"
              min={0}
              max={7200}
              value={form.minViewSeconds}
              onChange={(e) => setForm((f) => ({ ...f, minViewSeconds: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_max_executions')}</span>
            <input
              type="number"
              min={1}
              max={50}
              value={form.maxExecutionsPerPeriod}
              onChange={(e) => setForm((f) => ({ ...f, maxExecutionsPerPeriod: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_reset_type')}</span>
            <select
              value={form.resetType}
              onChange={(e) => setForm((f) => ({ ...f, resetType: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="DAILY">{t('admin_internal_offerwall.form_reset_daily')}</option>
              <option value="COOLDOWN">{t('admin_internal_offerwall.form_reset_cooldown')}</option>
            </select>
          </label>
          {form.resetType === 'COOLDOWN' ? (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_cooldown_seconds')}</span>
              <input
                type="number"
                min={60}
                max={604800}
                value={form.cooldownSeconds}
                onChange={(e) => setForm((f) => ({ ...f, cooldownSeconds: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
          ) : null}
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_reward_kind')}</span>
            <select
              value={form.rewardKind}
              onChange={(e) => setForm((f) => ({ ...f, rewardKind: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="BLK">BLK</option>
              <option value="POL">POL</option>
              <option value="HASHRATE_TEMP">HASHRATE_TEMP</option>
            </select>
          </label>
          {form.rewardKind === 'BLK' ? (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_reward_blk')}</span>
              <input
                value={form.rewardBlkAmount}
                onChange={(e) => setForm((f) => ({ ...f, rewardBlkAmount: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
              />
            </label>
          ) : null}
          {form.rewardKind === 'POL' ? (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_reward_pol')}</span>
              <input
                value={form.rewardPolAmount}
                onChange={(e) => setForm((f) => ({ ...f, rewardPolAmount: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
              />
            </label>
          ) : null}
          {form.rewardKind === 'HASHRATE_TEMP' ? (
            <>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_reward_hr')}</span>
                <input
                  value={form.rewardHashRate}
                  onChange={(e) => setForm((f) => ({ ...f, rewardHashRate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_reward_days')}</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={form.rewardHashRateDays}
                  onChange={(e) => setForm((f) => ({ ...f, rewardHashRateDays: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                />
              </label>
            </>
          ) : null}
          <label className="block space-y-1 sm:col-span-3">
            <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_required_actions')}</span>
            <textarea
              value={form.requiredActionsText}
              onChange={(e) => setForm((f) => ({ ...f, requiredActionsText: e.target.value }))}
              rows={3}
              placeholder={t('admin_internal_offerwall.form_required_actions_ph')}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_target_countries')}</span>
            <input
              value={form.targetCountryCodes}
              onChange={(e) => setForm((f) => ({ ...f, targetCountryCodes: e.target.value }))}
              placeholder="BR, US"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
            />
          </label>
          {form.kind === KIND_GEN ? (
            <label className="block space-y-1 sm:col-span-3">
              <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_external_info_url')}</span>
              <input
                value={form.externalInfoUrl}
                onChange={(e) => setForm((f) => ({ ...f, externalInfoUrl: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
              />
            </label>
          ) : null}
          <label className="block space-y-1 sm:col-span-3">
            <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_verification_note')}</span>
            <textarea
              value={form.verificationNote}
              onChange={(e) => setForm((f) => ({ ...f, verificationNote: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.form_completion')}</span>
            <select
              value={form.completionMode}
              onChange={(e) => setForm((f) => ({ ...f, completionMode: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="USER_SELF_CLAIM">{t('admin_internal_offerwall.completion_self')}</option>
              <option value="ADMIN_APPROVAL">{t('admin_internal_offerwall.completion_admin')}</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-400">{t('admin_internal_offerwall.sort_order')}</span>
            <input
              type="number"
              min={0}
              max={99999}
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-600 accent-sky-500"
            />
            <span className="text-sm text-slate-300">{t('admin_internal_offerwall.col_active')}</span>
          </label>
        </div>
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 xl:sticky xl:top-4 xl:self-start">
          <div className="flex items-center gap-2 text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            <p className="text-sm font-black uppercase tracking-wider">Resumo operacional</p>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <Globe className="mt-0.5 h-4 w-4 text-sky-400 shrink-0" />
              <div>
                <p className="font-bold text-white">Fluxo</p>
                <p className="text-slate-400">{form.kind === KIND_PTC ? 'Oferta abre em iframe e mede permanência mínima.' : 'Tarefa manual sem iframe, orientada por instruções e revisão.'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <TimerReset className="mt-0.5 h-4 w-4 text-amber-400 shrink-0" />
              <div>
                <p className="font-bold text-white">Disponibilidade</p>
                <p className="text-slate-400">
                  {form.maxExecutionsPerPeriod}x por {form.resetType === 'COOLDOWN' ? `cooldown de ${form.cooldownSeconds || 0}s` : 'dia calendário'}.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <Coins className="mt-0.5 h-4 w-4 text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold text-white">Recompensa</p>
                <p className="text-slate-400">{currentRewardSummary(form)}</p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-black/20 p-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Checklist</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-400">
                <li>{form.title.trim() ? 'Titulo pronto' : 'Falta definir titulo objetivo'}</li>
                <li>{form.kind === KIND_PTC ? (form.iframeUrl.trim() ? 'URL do parceiro pronta' : 'Falta URL do parceiro') : 'URL externa opcional'}</li>
                <li>{String(form.requiredActionsText || '').trim() ? 'Passos obrigatorios definidos' : 'Considere listar passos obrigatorios'}</li>
                <li>{form.completionMode === 'ADMIN_APPROVAL' ? 'Vai exigir revisao manual' : 'Usuario podera concluir sozinho'}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-600 px-6 py-2.5 text-sm font-black uppercase tracking-wide text-white disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Check className="h-4 w-4" aria-hidden />
          )}
          {saving
            ? editingId
              ? t('admin_internal_offerwall.patching')
              : t('admin_internal_offerwall.creating')
            : editingId
              ? t('admin_internal_offerwall.save_changes')
              : t('admin_internal_offerwall.create')}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          className="rounded-xl border border-slate-700 px-6 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
        >
          {t('admin_internal_offerwall.cancel')}
        </button>
      </div>
    </div>
  );
}

type OffersTableProps = {
  t: TFunction;
  offers: InternalOfferwallOfferRow[];
  loadingOffers: boolean;
  busyId: number | null;
  onToggleActive: (row: InternalOfferwallOfferRow) => Promise<void>;
  onEdit: (row: InternalOfferwallOfferRow) => void;
};

export function OffersTable({
  t,
  offers,
  loadingOffers,
  busyId,
  onToggleActive,
  onEdit,
}: OffersTableProps) {
  return loadingOffers ? (
    <div className="flex items-center gap-2 text-slate-400">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span>{t('admin_internal_offerwall.loading')}</span>
    </div>
  ) : (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
      <table className="min-w-full text-left text-sm text-slate-300">
        <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3 font-semibold">{t('admin_internal_offerwall.col_title')}</th>
            <th className="px-4 py-3 font-semibold">{t('admin_internal_offerwall.col_kind')}</th>
            <th className="px-4 py-3 font-semibold">{t('admin_internal_offerwall.col_active')}</th>
            <th className="px-4 py-3 font-semibold">{t('admin_internal_offerwall.col_reward')}</th>
            <th className="px-4 py-3 font-semibold">{t('admin_internal_offerwall.col_actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80">
          {offers.map((row) => (
            <tr key={row.id} className="hover:bg-slate-800/30">
              <td className="px-4 py-3 font-medium text-white">{row.title}</td>
              <td className="px-4 py-3 font-mono text-xs">{row.kind}</td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => onToggleActive(row)}
                  className="rounded-lg border border-slate-600 px-3 py-1 text-xs font-bold uppercase text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                >
                  {busyId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" aria-hidden /> : null}
                  {row.isActive ? t('admin_daily_tasks.yes') : t('admin_daily_tasks.no')}
                </button>
              </td>
              <td className="px-4 py-3 text-xs">{rewardSummary(row)}</td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onEdit(row)}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold uppercase text-amber-400 hover:bg-amber-500/20"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  {t('admin_internal_offerwall.edit')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ReviewQueueProps = {
  t: TFunction;
  attempts: InternalOfferwallAttemptRow[];
  loadingAttempts: boolean;
  busyId: number | null;
  rejectId: number | null;
  rejectNote: string;
  onApprove: (id: number) => Promise<void>;
  onReject: (id: number) => Promise<void>;
  onStartReject: (id: number) => void;
  onRejectNoteChange: (note: string) => void;
  onCancelReject: () => void;
};

export function ReviewQueue({
  t,
  attempts,
  loadingAttempts,
  busyId,
  rejectId,
  rejectNote,
  onApprove,
  onReject,
  onStartReject,
  onRejectNoteChange,
  onCancelReject,
}: ReviewQueueProps) {
  return (
    <div className="space-y-4">
      {loadingAttempts ? (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        </div>
      ) : attempts.length === 0 ? (
        <p className="text-slate-500">{t('admin_internal_offerwall.empty_review')}</p>
      ) : (
        <ul className="space-y-3">
          {attempts.map((a) => (
            <li key={a.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-white">
                    #{a.id} — {a.offer?.title || '—'}
                  </p>
                  <p className="text-xs text-slate-500 font-mono">
                    {a.user?.username || a.user?.email || `user ${a.userId}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === a.id}
                    onClick={() => onApprove(a.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold uppercase text-white hover:bg-emerald-500 disabled:opacity-40"
                  >
                    <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                    {t('admin_internal_offerwall.approve')}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === a.id}
                    onClick={() => onStartReject(a.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-600/90 px-3 py-1.5 text-xs font-bold uppercase text-white hover:bg-red-500 disabled:opacity-40"
                  >
                    <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
                    {t('admin_internal_offerwall.reject')}
                  </button>
                </div>
              </div>
              {rejectId === a.id ? (
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
                  <label className="text-xs text-slate-400">{t('admin_internal_offerwall.reject_note')}</label>
                  <textarea
                    value={rejectNote}
                    onChange={(e) => onRejectNoteChange(e.target.value)}
                    rows={2}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      onClick={() => onReject(a.id)}
                      className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold uppercase text-white disabled:opacity-40"
                    >
                      {t('admin_internal_offerwall.reject')}
                    </button>
                    <button
                      type="button"
                      onClick={onCancelReject}
                      className="rounded-lg border border-slate-600 px-4 py-2 text-xs font-bold uppercase text-slate-300"
                    >
                      {t('admin_internal_offerwall.cancel')}
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
