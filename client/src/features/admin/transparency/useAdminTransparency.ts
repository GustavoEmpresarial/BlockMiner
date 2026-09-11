import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { csrfHeaderObject } from '../../shared/utils/csrfHeader';
import { readAxiosResponseMessage } from '../lib/admin.api';
import type {
  JsonRecord,
  TrackedWalletFormState,
  TrackedWalletRow,
  TransparencyDirection,
  TransparencyEntry,
  TransparencyFormState,
  TransparencyPeriod,
  TransparencyType,
  WalletActivityPayload,
  WalletActivitySummary,
  WalletMovementRow,
} from './adminTransparency.types';
import {
  CATEGORIES,
  EMPTY_FORM,
  Field,
  INCOME_CATEGORIES,
  PERIODS,
  isRecord,
  readJsonMessage,
} from './adminTransparency.helpers';

export function useAdminTransparency() {
  const { t } = useTranslation();
  const [entries, setEntries]           = useState<TransparencyEntry[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [form, setForm]                 = useState<TransparencyFormState>(EMPTY_FORM);
  const [editId, setEditId]             = useState<number | null>(null);
  const [saving, setSaving]             = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [uploading, setUploading]       = useState(false);
  const fileInputRef                    = useRef<HTMLInputElement | null>(null);
  const [walletInput, setWalletInput]   = useState('');
  const [walletSaving, setWalletSaving] = useState(false);
  const [activity, setActivity]         = useState<WalletActivityPayload | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [trackedWallets, setTrackedWallets] = useState<TrackedWalletRow[]>([]);
  const [trackedWalletActivity, setTrackedWalletActivity] = useState<WalletActivityPayload | null>(null);
  const [trackedWalletLoading, setTrackedWalletLoading] = useState(false);
  const [trackedWalletSaving, setTrackedWalletSaving] = useState(false);
  const [trackedWalletForm, setTrackedWalletForm] = useState<TrackedWalletFormState>({
    label: '',
    address: '',
    chain: 'polygon',
    assetSymbol: 'POL',
    explorerBaseUrl: 'https://polygonscan.com/address',
    includeInTotals: true,
    isPublic: true,
    isActive: true,
    sortOrder: 0,
    manualUsdValue: '',
    manualValueNote: '',
  });

  const jsonHeaders = () => ({
    'Content-Type': 'application/json',
    ...csrfHeaderObject(),
  });

  // ── Data fetching ──────────────────────────────────────────────────────────

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/transparency', { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: unknown = await r.json();
      if (isRecord(d) && d.ok === true && Array.isArray(d.entries)) {
        setEntries(d.entries as TransparencyEntry[]);
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? t('transparency.admin.toast_error'));
    } finally {
      setLoading(false);
    }
  }

  async function loadTrackedWallets() {
    try {
      const r = await fetch('/api/admin/transparency/tracked-wallets', { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: unknown = await r.json();
      if (isRecord(d) && d.ok === true) {
        const wallets = d.wallets;
        setTrackedWallets(Array.isArray(wallets) ? (wallets as TrackedWalletRow[]) : []);
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao carregar carteiras rastreadas');
    }
  }

  async function loadWalletSettings() {
    try {
      const r = await fetch('/api/admin/transparency/wallet/settings', { credentials: 'include' });
      if (!r.ok) return;
      const d: unknown = await r.json();
      if (isRecord(d) && d.ok === true && typeof d.address === 'string') setWalletInput(d.address);
    } catch {
      /* ignore */
    }
  }

  async function saveWalletSettings() {
    setWalletSaving(true);
    try {
      const r = await fetch('/api/admin/transparency/wallet/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: jsonHeaders(),
        body: JSON.stringify({ address: walletInput }),
      });
      const d: unknown = await r.json();
      if (isRecord(d) && d.ok === true) {
        toast.success(t('transparency.admin.wallet_saved'));
        setWalletInput(typeof d.address === 'string' ? d.address : '');
      } else {
        toast.error(readJsonMessage(d) ?? t('transparency.admin.toast_error'));
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? t('transparency.admin.toast_error'));
    } finally {
      setWalletSaving(false);
    }
  }

  async function refreshWalletActivity() {
    setActivityLoading(true);
    try {
      const r = await fetch('/api/admin/transparency/wallet/activity', { credentials: 'include' });
      const d: unknown = await r.json();
      if (isRecord(d) && d.ok === true) {
        setActivity(d as WalletActivityPayload);
        if (d.apiKeyConfigured === false) toast.info(t('transparency.admin.wallet_api_key_hint'));
      } else {
        toast.error(readJsonMessage(d) ?? t('transparency.admin.toast_error'));
        setActivity(null);
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? t('transparency.admin.toast_error'));
      setActivity(null);
    } finally {
      setActivityLoading(false);
    }
  }

  async function refreshTrackedWalletActivity() {
    setTrackedWalletLoading(true);
    try {
      const r = await fetch('/api/admin/transparency/tracked-wallets/activity', { credentials: 'include' });
      const d: unknown = await r.json();
      if (isRecord(d) && d.ok === true) {
        setTrackedWalletActivity(d as WalletActivityPayload);
      } else {
        toast.error(readJsonMessage(d) ?? t('transparency.admin.toast_error'));
        setTrackedWalletActivity(null);
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? t('transparency.admin.toast_error'));
      setTrackedWalletActivity(null);
    } finally {
      setTrackedWalletLoading(false);
    }
  }

  async function saveTrackedWallet() {
    setTrackedWalletSaving(true);
    try {
      const r = await fetch('/api/admin/transparency/tracked-wallets', {
        method: 'POST',
        credentials: 'include',
        headers: jsonHeaders(),
        body: JSON.stringify(trackedWalletForm),
      });
      const d: unknown = await r.json();
      if (isRecord(d) && d.ok === true) {
        toast.success('Carteira rastreada salva');
        setTrackedWalletForm({
          label: '',
          address: '',
          chain: 'polygon',
          assetSymbol: 'POL',
          explorerBaseUrl: 'https://polygonscan.com/address',
          includeInTotals: true,
          isPublic: true,
          isActive: true,
          sortOrder: 0,
          manualUsdValue: '',
          manualValueNote: '',
        });
        loadTrackedWallets();
        refreshTrackedWalletActivity();
      } else {
        toast.error(readJsonMessage(d) ?? 'Erro ao salvar carteira rastreada');
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao salvar carteira rastreada');
    } finally {
      setTrackedWalletSaving(false);
    }
  }

  async function removeTrackedWallet(id: number) {
    try {
      const r = await fetch(`/api/admin/transparency/tracked-wallets/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: jsonHeaders(),
      });
      const d: unknown = await r.json();
      if (isRecord(d) && d.ok === true) {
        toast.success('Carteira removida');
        loadTrackedWallets();
        refreshTrackedWalletActivity();
      } else {
        toast.error(readJsonMessage(d) ?? 'Erro ao remover carteira');
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao remover carteira');
    }
  }

  useEffect(() => {
    load();
    loadWalletSettings();
    loadTrackedWallets();
    refreshTrackedWalletActivity();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Form helpers ───────────────────────────────────────────────────────────

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(entry: TransparencyEntry) {
    setEditId(entry.id);
    setForm({
      type:           entry.type ?? 'expense',
      category:       entry.category ?? 'infrastructure',
      incomeCategory: entry.incomeCategory ?? 'revenue',
      name:           entry.name,
      description:    entry.description ?? '',
      provider:       entry.provider ?? '',
      providerUrl:    entry.providerUrl ?? '',
      imageUrl:       entry.imageUrl ?? '',
      amountUsd:      String(entry.amountUsd),
      amountOriginal: entry.amountOriginal != null ? String(entry.amountOriginal) : '',
      currencyCode:   entry.currencyCode ?? 'USD',
      fxRateUsd:      entry.fxRateUsd != null ? String(entry.fxRateUsd) : '',
      period:         typeof entry.period === 'string' ? entry.period : 'monthly',
      entryDate:      entry.entryDate ? String(entry.entryDate).slice(0, 10) : '',
      direction:      typeof entry.direction === 'string' ? entry.direction : (entry.type === 'income' ? 'in' : 'out'),
      blockchain:     entry.blockchain ?? 'polygon',
      walletAddress:  entry.walletAddress ?? '',
      txHash:         entry.txHash ?? '',
      referenceUrl:   entry.referenceUrl ?? '',
      isOnChain:      Boolean(entry.isOnChain),
      isPaid:         entry.isPaid,
      isActive:       entry.isActive,
      notes:          entry.notes ?? '',
      sortOrder:      entry.sortOrder,
    });
    setShowForm(true);
  }

  // ── Image upload ───────────────────────────────────────────────────────────

  /**
   * Upload an image file to /admin/upload-image.
   * Validates file size client-side before sending (max 5 MB).
   * @param {File} file
   */
  async function handleImageUpload(file: File | undefined) {
    if (!file) return;
    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast.error(t('transparency.admin.toast_image_too_large'));
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r = await fetch('/api/admin/upload-image', {
        method: 'POST',
        credentials: 'include',
        headers: { ...csrfHeaderObject() },
        body: fd,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: unknown = await r.json();
      if (isRecord(d) && d.ok === true && typeof d.url === 'string') {
        const url = d.url;
        setForm(f => ({ ...f, imageUrl: url }));
        toast.success(t('transparency.admin.toast_image_uploaded'));
      } else {
        toast.error(readJsonMessage(d) ?? t('transparency.admin.toast_image_error'));
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? t('transparency.admin.toast_image_error'));
    } finally {
      setUploading(false);
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.name.trim()) return toast.error(t('transparency.admin.toast_name_required'));
    if (!form.amountUsd || isNaN(parseFloat(form.amountUsd))) return toast.error(t('transparency.admin.toast_invalid_amount'));
    setSaving(true);
    try {
      const url    = editId ? `/api/admin/transparency/${editId}` : '/api/admin/transparency';
      const method = editId ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method,
        credentials: 'include',
        headers: jsonHeaders(),
        body: JSON.stringify({
          ...form,
          amountUsd: parseFloat(form.amountUsd),
          amountOriginal: form.amountOriginal ? parseFloat(form.amountOriginal) : null,
          fxRateUsd: form.fxRateUsd ? parseFloat(form.fxRateUsd) : null,
          entryDate: form.entryDate || null,
        }),
      });
      const d: unknown = await r.json();
      if (isRecord(d) && d.ok === true) {
        toast.success(editId ? t('transparency.admin.toast_updated') : t('transparency.admin.toast_created'));
        setShowForm(false);
        load();
      } else {
        toast.error(readJsonMessage(d) ?? t('transparency.admin.toast_error'));
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? t('transparency.admin.toast_error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(entry: TransparencyEntry) {
    try {
      const r = await fetch(`/api/admin/transparency/${entry.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: jsonHeaders(),
        body: JSON.stringify({ isActive: !entry.isActive }),
      });
      const d: unknown = await r.json();
      if (isRecord(d) && d.ok === true) load();
      else toast.error(readJsonMessage(d) ?? t('transparency.admin.toast_error'));
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? t('transparency.admin.toast_error'));
    }
  }

  async function handleDelete(id: number) {
    try {
      const r = await fetch(`/api/admin/transparency/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: jsonHeaders(),
      });
      const d: unknown = await r.json();
      if (isRecord(d) && d.ok === true) {
        toast.success(t('transparency.admin.toast_deleted'));
        setConfirmDelete(null);
        load();
      } else {
        toast.error(readJsonMessage(d) ?? t('transparency.admin.toast_error'));
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? t('transparency.admin.toast_error'));
    }
  }

  // ── Category helpers ───────────────────────────────────────────────────────

  function getCatLabel(entry: TransparencyEntry): string {
    if (entry.type === 'income') {
      return String(t(`transparency.income_category.${entry.incomeCategory}`, entry.incomeCategory ?? ''));
    }
    return String(t(`transparency.category.${entry.category}`, entry.category ?? ''));
  }

  function getPeriodLabel(v: string): string {
    return String(t(`transparency.period.${v}`, v));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return {
    entries, setEntries, loading, setLoading, showForm, setShowForm, form, setForm, editId, setEditId, saving, setSaving, confirmDelete, setConfirmDelete, uploading, setUploading, walletInput, setWalletInput, walletSaving, setWalletSaving, activity, setActivity, activityLoading, setActivityLoading, trackedWallets, setTrackedWallets, trackedWalletActivity, setTrackedWalletActivity, trackedWalletLoading, setTrackedWalletLoading, trackedWalletSaving, setTrackedWalletSaving, trackedWalletForm, setTrackedWalletForm, fileInputRef, load, loadTrackedWallets, loadWalletSettings, saveWalletSettings, refreshWalletActivity, refreshTrackedWalletActivity, saveTrackedWallet, removeTrackedWallet, openCreate, openEdit, handleImageUpload, handleSave, handleToggleActive, handleDelete, getCatLabel, getPeriodLabel, jsonHeaders,
  };
}
