import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import axios from 'axios';
import { api } from '../../../shared/auth/auth.store';
import {
  type AdminDailyTaskDefinitionRow,
  type CreateFormState,
  type EditFormState,
  type DefinitionsListResponse,
  type MutationResponse,
  buildCreateBody,
  buildEditBody,
  defaultCreateForm,
  defaultEditForm,
  isCountTaskType
} from './adminDailyTasks/adminDailyTasksModel';

import {
  axiosErrorMessage,
} from './adminDailyTasks.shared';

export function useAdminDailyTasks() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AdminDailyTaskDefinitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [orderDraft, setOrderDraft] = useState<Record<number, string>>({});
  const [patching, setPatching] = useState<Record<number, boolean>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(() => defaultCreateForm());
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingRow, setEditingRow] = useState<AdminDailyTaskDefinitionRow | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await api.get<DefinitionsListResponse>('/admin/daily-tasks/definitions');
      if (res.data?.ok) {
        const list = res.data.definitions ?? [];
        setRows(list);
        setLoadFailed(false);
        const next: Record<number, string> = {};
        for (const r of list) {
          next[r.id] = String(r.sortOrder ?? 0);
        }
        setOrderDraft(next);
      } else {
        setRows([]);
        setLoadFailed(true);
        toast.error(t('admin_daily_tasks.load_error'));
      }
    } catch (e: unknown) {
      setRows([]);
      setLoadFailed(true);
      if (axios.isAxiosError(e)) {
        const status = e.response?.status;
        if (status === 401) toast.error(t('admin_daily_tasks.error_unauthorized'));
        else if (status != null && status >= 500) toast.error(t('admin_daily_tasks.error_server'));
        else if (!e.response) toast.error(t('admin_daily_tasks.error_network'));
        else toast.error(t('admin_daily_tasks.load_error'));
      } else {
        toast.error(t('admin_daily_tasks.load_error'));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const targetFieldLabelKey = useMemo(
    () =>
      isCountTaskType(createForm.taskType)
        ? 'admin_daily_tasks.create_target_count'
        : 'admin_daily_tasks.create_target_mine',
    [createForm.taskType]
  );

  const setRowPatching = (id: number, v: boolean) => {
    setPatching((p) => ({ ...p, [id]: v }));
  };

  const patchDefinition = async (id: number, body: Record<string, unknown>) => {
    setRowPatching(id, true);
    try {
      const res = await api.patch<MutationResponse>(`/admin/daily-tasks/definitions/${id}`, body);
      if (res.data?.ok) {
        toast.success(t('admin_daily_tasks.saved'));
        await load();
      } else {
        toast.error(res.data?.message || t('admin_daily_tasks.save_error'));
      }
    } catch (err: unknown) {
      toast.error(axiosErrorMessage(err) || t('admin_daily_tasks.save_error'));
    } finally {
      setRowPatching(id, false);
    }
  };

  const onToggleActive = (id: number, isActive: boolean) => {
    void patchDefinition(id, { isActive });
  };

  const onCadenceChange = (id: number, nextCadence: string, previousCadence: string | null | undefined) => {
    const next = String(nextCadence || 'DAILY').toUpperCase();
    const prev = String(previousCadence || 'DAILY').toUpperCase();
    if (next === prev) return;
    void patchDefinition(id, { resetCadence: next });
  };

  const onSaveOrder = (id: number) => {
    const raw = orderDraft[id];
    const n = parseInt(String(raw), 10);
    if (!Number.isInteger(n) || n < 0) {
      toast.error(t('admin_daily_tasks.save_error'));
      return;
    }
    void patchDefinition(id, { sortOrder: n });
  };

  const onCreate = async () => {
    const rawTv = parseFloat(String(createForm.targetValue).replace(',', '.'));
    if (isCountTaskType(createForm.taskType)) {
      if (!Number.isFinite(rawTv) || rawTv < 1 || Math.abs(rawTv - Math.round(rawTv)) > 1e-6) {
        toast.error(t('admin_daily_tasks.create_error_target_count'));
        return;
      }
    }
    setCreating(true);
    try {
      const body = buildCreateBody(createForm);
      const res = await api.post<MutationResponse>('/admin/daily-tasks/definitions', body);
      if (res.data?.ok) {
        toast.success(t('admin_daily_tasks.create_success'));
        setCreateForm(defaultCreateForm());
        setShowCreate(false);
        await load();
      } else {
        toast.error(res.data?.message || t('admin_daily_tasks.create_error'));
      }
    } catch (err: unknown) {
      toast.error(axiosErrorMessage(err) || t('admin_daily_tasks.create_error'));
    } finally {
      setCreating(false);
    }
  };

  const onStartEdit = (row: AdminDailyTaskDefinitionRow) => {
    if (editingRow?.id === row.id) {
      setEditingRow(null);
      setEditForm(null);
      return;
    }
    setEditingRow(row);
    setEditForm(defaultEditForm(row));
    setShowCreate(false);
  };

  const onCancelEdit = () => {
    setEditingRow(null);
    setEditForm(null);
  };

  const onSaveEdit = async () => {
    if (!editingRow || !editForm) return;
    setSaving(true);
    try {
      const body = buildEditBody(editForm);
      const res = await api.patch<MutationResponse>(`/admin/daily-tasks/definitions/${editingRow.id}`, body);
      if (res.data?.ok) {
        toast.success(t('admin_daily_tasks.edit_success'));
        setEditingRow(null);
        setEditForm(null);
        await load();
      } else {
        toast.error(res.data?.message || t('admin_daily_tasks.edit_error'));
      }
    } catch (err: unknown) {
      toast.error(axiosErrorMessage(err) || t('admin_daily_tasks.edit_error'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: number, slug: string) => {
    if (!window.confirm(t('admin_daily_tasks.delete_confirm', { slug }))) return;
    setDeletingId(id);
    try {
      const res = await api.delete<MutationResponse>(`/admin/daily-tasks/definitions/${id}`);
      if (res.data?.ok) {
        toast.success(t('admin_daily_tasks.delete_success'));
        await load();
      } else {
        toast.error(res.data?.message || t('admin_daily_tasks.delete_error'));
      }
    } catch (err: unknown) {
      toast.error(axiosErrorMessage(err) || t('admin_daily_tasks.delete_error'));
    } finally {
      setDeletingId(null);
    }
  };

  return {
    rows, setRows, loading, setLoading, loadFailed, setLoadFailed, orderDraft, setOrderDraft, patching, setPatching, showCreate, setShowCreate, createForm, setCreateForm, creating, setCreating, deletingId, setDeletingId, editingRow, setEditingRow, editForm, setEditForm, saving, setSaving, load, targetFieldLabelKey, setRowPatching, patchDefinition, onToggleActive, onCadenceChange, onSaveOrder, onCreate, onStartEdit, onCancelEdit, onSaveEdit, onDelete,
  };
}
