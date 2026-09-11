import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { api } from '../../../shared/auth/auth.store';
import { adminInternalOfferwallApi, readAxiosResponseMessage } from '../lib/admin.api';
import { OfferForm, OffersTable, ReviewQueue } from './adminInternalOfferwall.parts';
import {
  buildApiBody,
  defaultForm,
  rowToForm,
  type InternalOfferwallApiErr,
  type InternalOfferwallAttemptRow,
  type InternalOfferwallFormState,
  type InternalOfferwallOfferRow,
} from './adminInternalOfferwall.shared';
import { validateAdminInternalOfferwallForm } from './adminInternalOfferwallValidate';

function apiErrMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as InternalOfferwallApiErr | undefined;
    if (data?.code === 'IFRAME_HOST_NOT_ALLOWED' && data.details?.host) {
      return `Host não permitido: ${data.details.host}`;
    }
    if (typeof data?.message === 'string' && data.message) return data.message;
  }
  return readAxiosResponseMessage(err) ?? fallback;
}

export default function AdminInternalOfferwallPage() {
  const { t } = useTranslation();
  const [offers, setOffers] = useState<InternalOfferwallOfferRow[]>([]);
  const [attempts, setAttempts] = useState<InternalOfferwallAttemptRow[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [loadingAttempts, setLoadingAttempts] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<InternalOfferwallFormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const loadOffers = useCallback(async () => {
    setLoadingOffers(true);
    try {
      const res = await adminInternalOfferwallApi.offers();
      const data = res.data as { ok?: boolean; offers?: InternalOfferwallOfferRow[] };
      setOffers(Array.isArray(data.offers) ? data.offers : []);
    } catch (err) {
      toast.error(apiErrMessage(err, t('admin_internal_offerwall.load_error')));
    } finally {
      setLoadingOffers(false);
    }
  }, [t]);

  const loadAttempts = useCallback(async () => {
    setLoadingAttempts(true);
    try {
      const res = await adminInternalOfferwallApi.attempts({ status: 'PENDING_REVIEW', limit: 100 });
      const data = res.data as { ok?: boolean; attempts?: InternalOfferwallAttemptRow[] };
      setAttempts(Array.isArray(data.attempts) ? data.attempts : []);
    } catch (err) {
      toast.error(apiErrMessage(err, t('admin_internal_offerwall.load_error')));
    } finally {
      setLoadingAttempts(false);
    }
  }, [t]);

  const refresh = useCallback(async () => {
    await Promise.all([loadOffers(), loadAttempts()]);
  }, [loadAttempts, loadOffers]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm());
    setFormOpen(true);
  };

  const openEdit = (row: InternalOfferwallOfferRow) => {
    setEditingId(row.id);
    setForm(rowToForm(row));
    setFormOpen(true);
  };

  const onSave = async () => {
    const v = validateAdminInternalOfferwallForm(form as unknown as Record<string, unknown>);
    if (!v.ok) {
      toast.error(t(v.i18nKey));
      return;
    }
    setSaving(true);
    try {
      const body = buildApiBody(form);
      if (editingId != null) {
        await api.put(`/admin/internal-offerwall/offers/${editingId}`, body);
        toast.success(t('admin_internal_offerwall.saved', { defaultValue: 'Oferta atualizada' }));
      } else {
        await api.post('/admin/internal-offerwall/offers', body);
        toast.success(t('admin_internal_offerwall.created', { defaultValue: 'Oferta criada' }));
      }
      setFormOpen(false);
      setEditingId(null);
      await loadOffers();
    } catch (err) {
      toast.error(apiErrMessage(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  const onToggleActive = async (row: InternalOfferwallOfferRow) => {
    setBusyId(row.id);
    try {
      await api.patch(`/admin/internal-offerwall/offers/${row.id}`, { isActive: !row.isActive });
      toast.success(t('admin_internal_offerwall.toggled', { defaultValue: 'Status atualizado' }));
      await loadOffers();
    } catch (err) {
      toast.error(apiErrMessage(err, t('common.error')));
    } finally {
      setBusyId(null);
    }
  };

  const onApprove = async (id: number) => {
    setBusyId(id);
    try {
      await api.post(`/admin/internal-offerwall/attempts/${id}/approve`);
      toast.success(t('admin_internal_offerwall.approve_ok', { defaultValue: 'Aprovado' }));
      await loadAttempts();
    } catch (err) {
      toast.error(apiErrMessage(err, t('common.error')));
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (id: number) => {
    setBusyId(id);
    try {
      await api.post(`/admin/internal-offerwall/attempts/${id}/reject`, {
        note: rejectNote.trim() || undefined,
      });
      toast.success(t('admin_internal_offerwall.reject_ok', { defaultValue: 'Rejeitado' }));
      setRejectId(null);
      setRejectNote('');
      await loadAttempts();
    } catch (err) {
      toast.error(apiErrMessage(err, t('common.error')));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">{t('admin_internal_offerwall.title', { defaultValue: 'Offerwall interno' })}</h1>
          <p className="text-sm text-slate-500">
            {t('admin_internal_offerwall.subtitle', { defaultValue: 'Ofertas PTC / tarefas + fila de revisão' })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200"
          >
            <RefreshCw className={`h-4 w-4 ${loadingOffers || loadingAttempts ? 'animate-spin' : ''}`} />
            {t('common.refresh', { defaultValue: 'Atualizar' })}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500/20 px-4 py-2 text-xs font-bold text-amber-300"
          >
            <Plus className="h-4 w-4" />
            {t('admin_internal_offerwall.create')}
          </button>
        </div>
      </header>

      {formOpen ? (
        <OfferForm
          t={t}
          form={form}
          setForm={setForm}
          editingId={editingId}
          saving={saving}
          onSave={onSave}
          onClose={() => {
            if (!saving) {
              setFormOpen(false);
              setEditingId(null);
            }
          }}
        />
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
          {t('admin_internal_offerwall.offers_section', { defaultValue: 'Ofertas' })}
        </h2>
        <OffersTable
          t={t}
          offers={offers}
          loadingOffers={loadingOffers}
          busyId={busyId}
          onToggleActive={onToggleActive}
          onEdit={openEdit}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-amber-400/90">
          {t('admin_internal_offerwall.review_section', { defaultValue: 'Fila de revisão' })}
        </h2>
        {loadingAttempts ? (
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>{t('admin_internal_offerwall.loading')}</span>
          </div>
        ) : (
          <ReviewQueue
            t={t}
            attempts={attempts}
            loadingAttempts={loadingAttempts}
            busyId={busyId}
            rejectId={rejectId}
            rejectNote={rejectNote}
            onApprove={onApprove}
            onReject={onReject}
            onStartReject={(id) => {
              setRejectId(id);
              setRejectNote('');
            }}
            onRejectNoteChange={setRejectNote}
            onCancelReject={() => {
              setRejectId(null);
              setRejectNote('');
            }}
          />
        )}
      </section>
    </div>
  );
}
