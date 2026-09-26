import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Loader2,
  RotateCcw,
  Save,
  ShieldAlert,
  Sliders,
  Zap,
} from 'lucide-react';
import {
  FAUCET_COOLDOWN_PRESETS,
  type AdminFaucetConfigInput,
  type AdminFaucetRewardDetail,
} from '../adminFaucet.types';

interface FaucetConfigFormProps {
  reward: AdminFaucetRewardDetail | null;
  formName: string;
  setFormName: (val: string) => void;
  formHashRate: number;
  setFormHashRate: (val: number) => void;
  formImageUrl: string;
  setFormImageUrl: (val: string) => void;
  formCooldownMs: number;
  setFormCooldownMs: (val: number) => void;
  formIsActive: boolean;
  setFormIsActive: (val: boolean) => void;
  saving: boolean;
  onSave: (payload: AdminFaucetConfigInput) => Promise<void>;
  onReset: () => void;
}

export const FaucetConfigForm: React.FC<FaucetConfigFormProps> = ({
  reward,
  formName,
  setFormName,
  formHashRate,
  setFormHashRate,
  formImageUrl,
  setFormImageUrl,
  formCooldownMs,
  setFormCooldownMs,
  formIsActive,
  setFormIsActive,
  saving,
  onSave,
  onReset,
}) => {
  const { t } = useTranslation();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trimmedName = formName.trim() || reward?.miner.name || 'Faucet Power Boost';

    if (!Number.isFinite(formHashRate) || formHashRate <= 0) {
      setValidationError('O Poder de Mineração (Hash Rate) deve ser maior que zero.');
      return;
    }

    if (!Number.isFinite(formCooldownMs) || formCooldownMs < 60000) {
      setValidationError('O intervalo de cooldown mínimo é de 1 minuto (60.000 ms).');
      return;
    }

    const trimmedImageUrl = formImageUrl.trim();
    if (trimmedImageUrl && !/^(\/(?!\/)|https?:\/\/)/i.test(trimmedImageUrl)) {
      setValidationError('A URL da imagem deve iniciar com /media/... ou https://');
      return;
    }

    const payload: AdminFaucetConfigInput = {
      name: trimmedName,
      baseHashRate: Number(formHashRate),
      imageUrl: trimmedImageUrl || null,
      cooldownMs: Math.floor(formCooldownMs),
      isActive: formIsActive,
    };

    await onSave(payload);
  };

  const isPresetActive = (ms: number) => formCooldownMs === ms;

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-6 rounded-3xl border border-white/10 bg-slate-900/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl"
    >
      {/* Cabeçalho do Card de Formulário (Sem repetição do título da página) */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-white tracking-wide">
              Parâmetros de Recompensa
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              Defina a quantidade de poder temporário e a frequência de resgate permitida.
            </p>
          </div>
        </div>
      </div>

      {validationError && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300 font-semibold animate-shake">
          <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{validationError}</span>
        </div>
      )}

      {/* 1. Poder de Mineração Temporário (Hash Rate) */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200">
          <Zap className="h-4 w-4 text-sky-400" />
          Poder de Mineração Concedido (H/s)
        </label>
        <div className="relative">
          <input
            type="number"
            value={formHashRate || ''}
            onChange={(e) => setFormHashRate(Number(e.target.value))}
            min="0.1"
            max="1000000"
            step="any"
            placeholder="30"
            required
            className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3.5 text-base font-bold text-white placeholder-slate-600 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/20 transition-all pr-16"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-sky-400">
            H/s
          </span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Poder creditado no <strong className="text-slate-300">UserPowerGame</strong> por 24 horas (ou 7 dias com o Power Boost ativado). Não ocupa slots de máquinas.
        </p>
      </div>

      {/* 2. Intervalo de Cooldown com Presets Rápidos */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200">
          <Clock className="h-4 w-4 text-amber-400" />
          Intervalo de Espera entre Resgates (Cooldown)
        </label>

        {/* Presets Rápidos */}
        <div className="flex flex-wrap gap-2">
          {FAUCET_COOLDOWN_PRESETS.map((preset) => {
            const active = isPresetActive(preset.ms);
            return (
              <button
                key={preset.ms}
                type="button"
                onClick={() => setFormCooldownMs(preset.ms)}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                  active
                    ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20 scale-105'
                    : 'border border-white/10 bg-slate-950/70 text-slate-300 hover:border-amber-400/40 hover:text-white'
                }`}
              >
                {t(preset.labelKey, preset.defaultLabel)}
              </button>
            );
          })}
        </div>

        {/* Input Numérico em ms */}
        <div className="relative mt-2">
          <input
            type="number"
            value={formCooldownMs || ''}
            onChange={(e) => setFormCooldownMs(Number(e.target.value))}
            min="60000"
            max="604800000"
            step="1000"
            placeholder="3600000"
            required
            className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-semibold text-white placeholder-slate-600 focus:border-amber-400/50 focus:outline-none focus:ring-2 focus:ring-amber-400/20 transition-all pr-12"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-500">
            ms
          </span>
        </div>
        <p className="text-[11px] text-slate-400">
          Equivalente a <strong className="text-white">{(formCooldownMs / 60000).toFixed(1)} minutos</strong> ou <strong className="text-white">{(formCooldownMs / 3600000).toFixed(2)} horas</strong>.
        </p>
      </div>

      {/* 3. Toggle Status Ativo */}
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 p-4 sm:p-5">
        <div>
          <span className="text-xs font-black uppercase tracking-wider text-white">
            Status do Claim Público
          </span>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Quando ativo, permite que os jogadores visitem o parceiro e realizem o resgate na página /faucet
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={formIsActive}
          onClick={() => setFormIsActive(!formIsActive)}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-400/40 ${
            formIsActive ? 'bg-emerald-500' : 'bg-slate-700'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
              formIsActive ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* 4. Metadados do Banco de Dados (Colapsável) */}
      <div className="border border-white/5 rounded-2xl bg-slate-950/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5 text-slate-500" />
            Metadados Internos do Registro ({formName || 'Pulse Mini v1'})
          </span>
          {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showAdvanced && (
          <div className="p-4 pt-2 border-t border-white/5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400">
                Nome interno do template no banco (tabela miners)
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Pulse Mini v1"
                maxLength={100}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400">
                URL de mídia da mineradora base
              </label>
              <input
                type="text"
                value={formImageUrl}
                onChange={(e) => setFormImageUrl(e.target.value)}
                placeholder="/media/miners/reward2.webp"
                maxLength={1000}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/40"
              />
            </div>
          </div>
        )}
      </div>

      {/* Botões de Ação */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
        <button
          type="button"
          onClick={onReset}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-800/60 px-5 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-all disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          Desfazer
        </button>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-7 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-amber-400/20 hover:bg-amber-300 active:scale-95 transition-all disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Salvar Configuração
            </>
          )}
        </button>
      </div>
    </form>
  );
};
