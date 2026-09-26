import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Cpu, Image as ImageIcon, Sparkles, Zap } from 'lucide-react';
import type { AdminFaucetRewardDetail } from '../adminFaucet.types';

interface FaucetRewardPreviewCardProps {
  reward: AdminFaucetRewardDetail | null;
  formName: string;
  formHashRate: number;
  formImageUrl: string;
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
  formName,
  formHashRate,
  formImageUrl,
  formCooldownMs,
  formIsActive,
}) => {
  const { t } = useTranslation();
  const [imageError, setImageError] = React.useState(false);

  const displayName = formName || reward?.miner.name || 'Mineradora Faucet';
  const displayHashRate = formHashRate > 0 ? formHashRate : (reward?.miner.baseHashRate ?? 30);
  const displayImageUrl = formImageUrl || reward?.miner.imageUrl || '';
  const displayCooldown = formCooldownMs > 0 ? formCooldownMs : (reward?.cooldownMs ?? 3600000);
  const displayActive = formIsActive;

  React.useEffect(() => {
    setImageError(false);
  }, [displayImageUrl]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950 p-6 shadow-2xl backdrop-blur-xl">
      <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

      {/* Header do Card */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
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

      {/* Visualização Central da Máquina */}
      <div className="flex flex-col items-center justify-center py-4">
        <div className="relative flex h-36 w-36 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 p-3 shadow-inner">
          {displayImageUrl && !imageError ? (
            <img
              src={displayImageUrl}
              alt={displayName}
              onError={() => setImageError(true)}
              className="max-h-full max-w-full object-contain filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition-transform hover:scale-105 duration-300"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-500 gap-1.5">
              <ImageIcon className="h-10 w-10 stroke-[1.5]" />
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-600">
                Sem Imagem
              </span>
            </div>
          )}
        </div>

        <h4 className="mt-4 text-base font-black text-white tracking-wide text-center">
          {displayName}
        </h4>
        <span className="text-[11px] text-slate-400 font-medium mt-0.5">
          Slug:{' '}
          <code className="text-amber-300/90 font-mono text-[11px]">
            {reward?.miner.slug ?? 'faucet-miner'}
          </code>
        </span>
      </div>

      {/* Grid de Métricas Principais */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-slate-950/60 p-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t('adminFaucet.hash_rate', 'Hash Rate Base')}
            </p>
            <p className="text-sm font-black text-white">
              +{displayHashRate} <span className="text-xs font-semibold text-amber-400">H/s</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-slate-950/60 p-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t('adminFaucet.cooldown_label', 'Intervalo')}
            </p>
            <p className="text-sm font-black text-white">{formatCooldown(displayCooldown)}</p>
          </div>
        </div>
      </div>

      {/* Nota Explicativa de Regra de Negócio */}
      <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex items-start gap-2.5">
        <Cpu className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed text-slate-300">
          <strong className="text-amber-300">Poder Temporário:</strong> O claim da faucet credita{' '}
          <strong className="text-white">UserPowerGame</strong> com duração de 24 horas (ou 7 dias com o
          Power Boost ativo), sem alterar o inventário permanente de máquinas do jogador.
        </p>
      </div>
    </div>
  );
};
