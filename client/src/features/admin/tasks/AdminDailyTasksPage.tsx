import { useTranslation } from 'react-i18next';
import { Loader2, ListChecks, Plus } from 'lucide-react';
import {
  CreateTaskForm,
  DefinitionsTable,
  EditTaskForm,
} from './adminDailyTasks/adminDailyTasks.parts';
import { useAdminDailyTasks } from './useAdminDailyTasks';

export default function AdminDailyTasks() {
  const { t } = useTranslation();
  const {
    rows,
    loading,
    loadFailed,
    orderDraft,
    setOrderDraft,
    patching,
    showCreate,
    setShowCreate,
    createForm,
    setCreateForm,
    creating,
    deletingId,
    editingRow,
    editForm,
    setEditForm,
    saving,
    load,
    targetFieldLabelKey,
    onToggleActive,
    onCadenceChange,
    onSaveOrder,
    onCreate,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onDelete,
  } = useAdminDailyTasks();

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-amber-500/10 p-3 text-amber-500">
          <ListChecks className="h-8 w-8" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black tracking-tight text-white">{t('admin_daily_tasks.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">{t('admin_daily_tasks.subtitle')}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl text-sm leading-relaxed text-slate-300">{t('admin_daily_tasks.crud_hint')}</p>
        <button
          type="button"
          onClick={() => setShowCreate((s) => !s)}
          className="inline-flex shrink-0 min-h-[44px] items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-bold uppercase tracking-wide text-amber-400 hover:bg-amber-500/20"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t('admin_daily_tasks.create_task')}
        </button>
      </div>

      {showCreate ? (
        <CreateTaskForm
          t={t}
          createForm={createForm}
          setCreateForm={setCreateForm}
          targetFieldLabelKey={targetFieldLabelKey}
          creating={creating}
          setShowCreate={setShowCreate}
          onCreate={onCreate}
        />
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span>{t('admin_daily_tasks.loading')}</span>
        </div>
      ) : loadFailed ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-950/20 p-6 space-y-4 max-w-2xl">
          <p className="text-sm text-red-100/95 leading-relaxed">{t('admin_daily_tasks.load_failed_body')}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center rounded-xl border border-red-400/40 bg-red-500/15 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-red-200 hover:bg-red-500/25"
          >
            {t('admin_daily_tasks.retry')}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-slate-500">{t('admin_daily_tasks.empty')}</p>
      ) : (
        <DefinitionsTable
          t={t}
          rows={rows}
          patching={patching}
          orderDraft={orderDraft}
          setOrderDraft={setOrderDraft}
          saving={saving}
          editingRow={editingRow}
          deletingId={deletingId}
          onToggleActive={onToggleActive}
          onCadenceChange={onCadenceChange}
          onSaveOrder={onSaveOrder}
          onStartEdit={onStartEdit}
          onDelete={onDelete}
        />
      )}

      {editingRow && editForm ? (
        <EditTaskForm
          t={t}
          editingRow={editingRow}
          editForm={editForm}
          setEditForm={setEditForm}
          saving={saving}
          onCancelEdit={onCancelEdit}
          onSaveEdit={onSaveEdit}
        />
      ) : null}
    </div>
  );
}
