import type { TFunction } from 'i18next';
import type { AdminDailyTaskDefinitionRow, CreateFormState, EditFormState } from './adminDailyTasksModel';
import { formatRewardSummary } from './adminDailyTasksModel';

type T = TFunction;

export function CreateTaskForm(_props: {
  t: T;
  createForm: CreateFormState;
  setCreateForm: (v: CreateFormState) => void;
  targetFieldLabelKey: string;
  creating: boolean;
  setShowCreate: (v: boolean) => void;
  onCreate: () => void;
}) {
  return (
    <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
      Formulário completo de criação não está no snapshot legacy — use a API{' '}
      <code className="text-amber-300">POST /admin/daily-tasks/definitions</code> ou restaure{' '}
      <code className="text-amber-300">adminDailyTasks.parts.tsx</code> do bundle de produção.
    </p>
  );
}

export function EditTaskForm(_props: {
  t: T;
  editingRow: AdminDailyTaskDefinitionRow;
  editForm: EditFormState;
  setEditForm: (v: EditFormState) => void;
  saving: boolean;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
}) {
  return null;
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
  const { rows, onToggleActive, onDelete } = props;
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-900/80 text-[10px] uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left">Slug</th>
            <th className="px-4 py-3 text-left">Tipo</th>
            <th className="px-4 py-3 text-left">Recompensa</th>
            <th className="px-4 py-3 text-left">Ativo</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-white/5">
              <td className="px-4 py-3 font-mono text-white">{r.slug}</td>
              <td className="px-4 py-3 text-slate-300">{r.taskType}</td>
              <td className="px-4 py-3 text-emerald-400">{formatRewardSummary(r)}</td>
              <td className="px-4 py-3">{r.isActive !== false ? 'Sim' : 'Não'}</td>
              <td className="px-4 py-3 text-right space-x-2">
                <button type="button" onClick={() => onToggleActive(r.id, !(r.isActive !== false))} className="text-xs font-bold text-amber-400">
                  Toggle
                </button>
                <button type="button" onClick={() => onDelete(r.id, r.slug)} className="text-xs font-bold text-red-400">
                  Excluir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
