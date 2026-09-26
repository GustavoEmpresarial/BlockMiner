import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Droplets, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAdminFaucetConfig, saveAdminFaucetConfig } from './adminFaucet.api';
import type { AdminFaucetConfigInput, AdminFaucetRewardDetail } from './adminFaucet.types';
import { FaucetRewardPreviewCard } from './components/FaucetRewardPreviewCard';
import { FaucetConfigForm } from './components/FaucetConfigForm';

export default function AdminFaucetPage() {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reward, setReward] = useState<AdminFaucetRewardDetail | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formHashRate, setFormHashRate] = useState(30);
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formCooldownMs, setFormCooldownMs] = useState(3600000);
  const [formIsActive, setFormIsActive] = useState(true);

  const populateForm = useCallback((data: AdminFaucetRewardDetail | null) => {
    if (!data) return;
    setFormName(data.miner.name ?? '');
    setFormHashRate(data.miner.baseHashRate ?? 30);
    setFormImageUrl(data.miner.imageUrl ?? '');
    setFormCooldownMs(data.cooldownMs ?? 3600000);
    setFormIsActive(data.isActive ?? true);
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminFaucetConfig();
      if (res.ok && res.reward) {
        setReward(res.reward);
        populateForm(res.reward);
      } else if (!res.ok) {
        setError(res.message || t('adminFaucet.load_error', 'Falha ao carregar configuração da faucet.'));
      }
    } catch {
      setError(t('adminFaucet.load_error', 'Falha ao carregar configuração da faucet.'));
    } finally {
      setLoading(false);
    }
  }, [populateForm, t]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleSave = async (payload: AdminFaucetConfigInput) => {
    setSaving(true);
    try {
      const res = await saveAdminFaucetConfig(payload);
      if (res.ok && res.reward) {
        setReward(res.reward);
        populateForm(res.reward);
        toast.success(res.message || t('adminFaucet.saved', 'Configuração da faucet salva.'));
      } else {
        toast.error(res.message || t('adminFaucet.save_error', 'Falha ao salvar configuração da faucet.'));
      }
    } catch {
      toast.error(t('adminFaucet.save_error', 'Falha ao salvar configuração da faucet.'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    populateForm(reward);
    toast.info('Alterações descartadas.');
  };

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
          {t('adminFaucet.loading', 'Carregando configuração da faucet…')}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 shadow-lg shadow-amber-500/20">
            <Droplets className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              {t('adminFaucet.title', 'Configuração da Faucet')}
            </h1>
            <p className="text-xs sm:text-sm font-medium text-slate-400 mt-1">
              {t('adminFaucet.subtitle', 'Gerencie a recompensa mineradora ativa da faucet e o intervalo.')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadConfig()}
          disabled={loading || saving}
          className="inline-flex items-center gap-2 self-start rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2.5 text-xs font-bold text-slate-300 hover:border-amber-400/40 hover:text-white transition-all disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('adminFaucet.refresh', 'Atualizar')}
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-3xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm font-bold text-rose-300">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadConfig()}
            className="rounded-xl bg-rose-500/20 px-3 py-1.5 text-xs font-black uppercase text-rose-200 hover:bg-rose-500/30"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Main Grid: Form + Live Preview */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        <div className="lg:col-span-7">
          <FaucetConfigForm
            reward={reward}
            formName={formName}
            setFormName={setFormName}
            formHashRate={formHashRate}
            setFormHashRate={setFormHashRate}
            formImageUrl={formImageUrl}
            setFormImageUrl={setFormImageUrl}
            formCooldownMs={formCooldownMs}
            setFormCooldownMs={setFormCooldownMs}
            formIsActive={formIsActive}
            setFormIsActive={setFormIsActive}
            saving={saving}
            onSave={handleSave}
            onReset={handleReset}
          />
        </div>

        <div className="lg:col-span-5 sticky top-8">
          <FaucetRewardPreviewCard
            reward={reward}
            formName={formName}
            formHashRate={formHashRate}
            formImageUrl={formImageUrl}
            formCooldownMs={formCooldownMs}
            formIsActive={formIsActive}
          />
        </div>
      </div>
    </div>
  );
}
