import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock3, Info, Sparkles, Zap } from 'lucide-react';
import type { AdminFaucetRewardDetail } from '../adminFaucet.types';

interface FaucetRewardPreviewCardProps {
  reward: AdminFaucetRewardDetail | null;
  formName: string;
  formHashRate: number;
  formCooldownMs: number;
  formIsActive: boolean;
}

function formatCooldown(ms: number): string {
  if (ms <= 0) return '0 min';
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;
  if (remMinutes === 0) return `${hours}h`;
  return `${hours}h ${remMinutes}m`;
}

export const FaucetRewardPreviewCard: React.FC<FaucetRewardPreviewCardProps> = ({
  reward,
  formHashRate,
  formCooldownMs,
  formIsActive,
}) => {
  const { t } = useTranslation();

  const displayHashRate = formHashRate > 0 ? formHashRate : (reward?.miner.baseHashRate ?? 30);
  const displayCooldown = formCooldownMs > 0 ? formCooldownMs : (reward?.cooldownMs ?? 3600000);
  const displayActive = formIsActive;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-sky-500/20 bg-gradient-to-b from-slate-900/95 via-slate-950 to-slate-950 p-6 shadow-2xl backdrop-blur-xl">
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

      {/* Header do Card */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">
              {t('adminFaucet.preview', 'Pré-visualização do Jogador')}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">
              {t('adminFaucet.preview_hint', 'Como a recompensa da faucet é vista na página pública')}
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold tracking-wide uppercase ${
            displayActive
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${displayActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}
          />
          {displayActive ? t('adminFaucet.active', 'Ativa') : t('adminFaucet.inactive', 'Inativa')}
        </span>
      </div>

      {/* Caixa de Recompensa em Poder — Idêntica à /faucet */}
      <div className="flex flex-col items-center justify-center text-center py-6 px-4 rounded-3xl border border-sky-500/20 bg-slate-950/80 shadow-inner group">
        <div className="flex h-36 w-36 items-center justify-center rounded-3xl border border-sky-400/30 bg-gradient-to-br from-sky-500/20 via-sky-400/10 to-transparent p-6 shadow-inner group-hover:scale-105 transition-transform duration-500">
          <Zap className="h-20 w-20 text-sky-400 drop-shadow-[0_0_20px_rgba(56,189,248,0.5)] animate-pulse" />
        </div>

        <div className="mt-5 space-y-1.5">
          <span className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">
            Poder de Mineração
          </span>
          <h4 className="text-3xl font-black text-sky-400 tabular-nums tracking-tight">
            +{displayHashRate} <span className="text-xl font-bold text-sky-300">H/s</span>
          </h4>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-300 border border-sky-500/20">
            <Clock3 className="h-3.5 w-3.5 text-sky-400" />
            <span>Temporário por 24 horas (ou 7d com Boost)</span>
          </div>
        </div>
      </div>

      {/* Métricas e Regras */}
      <div className="grid grid-cols-2 gap-3 mt-5">
        <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Poder por Resgate
          </p>
          <p className="text-base font-black text-white mt-0.5">
            +{displayHashRate} <span className="text-xs font-semibold text-sky-400">H/s</span>
          </p>
        </div>

        <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Intervalo de Resgate
          </p>
          <p className="text-base font-black text-white mt-0.5">{formatCooldown(displayCooldown)}</p>
        </div>
      </div>

      {/* Nota Explicativa de Regra de Negócio */}
      <div className="mt-5 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 flex items-start gap-3">
        <Info className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed text-slate-300">
          <strong className="text-sky-300">Regra de Negócio:</strong> A faucet concede{' '}
          <strong className="text-white">exclusivamente poder de mineração temporário</strong> (tabela{' '}
          <code className="text-sky-300 font-mono text-[10px]">UserPowerGame</code>). Não é uma mineradora física,
          não ocupa slots e não consome energia do jogador.
        </p>
      </div>
    </div>
  );
};
