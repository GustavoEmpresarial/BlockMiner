import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  PauseCircle,
  RefreshCw,
  ShieldAlert,
  Wallet,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AdminHotWalletStatus } from '../adminFinance.types';

interface HotWalletStatusPanelProps {
  status: AdminHotWalletStatus | null;
  loading: boolean;
  onRefresh: () => void;
}

export const HotWalletStatusPanel: React.FC<HotWalletStatusPanelProps> = ({
  status,
  loading,
  onRefresh,
}) => {
  const [copied, setCopied] = useState(false);

  const copyAddress = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      toast.success('Endereço da Hot Wallet copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Erro ao copiar endereço.');
    }
  };

  if (!status) {
    return null;
  }

  const isConfigured = status.configured && Boolean(status.address);
  const isPaused = status.globalPause;
  const isEnabled = status.autoSendEnabled;
  const inCooldown = status.cooldownMs > 0;
  const isLive = isConfigured && isEnabled && !isPaused && !inCooldown;

  // Status visual classification
  let statusBadge = {
    label: 'Auto-Send Ativo',
    bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-400 animate-pulse',
    icon: Zap,
  };

  if (!isConfigured) {
    statusBadge = {
      label: 'Chave Não Configurada',
      bg: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      dot: 'bg-rose-400',
      icon: ShieldAlert,
    };
  } else if (isPaused) {
    statusBadge = {
      label: 'Pausado Globalmente (Kill Switch)',
      bg: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      dot: 'bg-rose-400',
      icon: PauseCircle,
    };
  } else if (!isEnabled) {
    statusBadge = {
      label: 'Auto-Send Desligado',
      bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      dot: 'bg-amber-400',
      icon: AlertTriangle,
    };
  } else if (inCooldown) {
    statusBadge = {
      label: `Cooldown (${Math.ceil(status.cooldownMs / 60000)}m restante)`,
      bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      dot: 'bg-amber-400 animate-pulse',
      icon: Clock,
    };
  }

  const BadgeIcon = statusBadge.icon;
  const balancePol = status.balancePol != null ? Number(status.balancePol) : null;
  const isLowBalance = balancePol != null && balancePol < status.minReservePol;
  const insufficientForQueue = status.canCoverPending === false;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950 p-6 shadow-2xl backdrop-blur-xl">
      <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-inner">
            <Flame className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black uppercase tracking-wider text-white">
                Hot Wallet & Envio Automático
              </h3>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Motor de liquidação on-chain para saques dos jogadores (Polygon RPC / CoinEx)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-bold tracking-wide border ${statusBadge.bg}`}
          >
            <span className={`h-2 w-2 rounded-full ${statusBadge.dot}`} />
            <BadgeIcon className="h-3.5 w-3.5" />
            {statusBadge.label}
          </span>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title="Atualizar status da Hot Wallet"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-slate-950 text-slate-400 hover:text-white hover:border-amber-400/30 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Avisos Importantes */}
      {isPaused && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-semibold text-rose-300">
          <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
          <div>
            <p className="font-bold text-white">Envio Automático Pausado</p>
            <p className="text-rose-200/80 mt-0.5">
              A variável <code className="font-mono text-rose-300 font-bold">WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE=true</code> está ativa no servidor. Os saques são criados e aprovados normalmente, mas aguardam na fila até o desarmamento do kill switch.
            </p>
          </div>
        </div>
      )}

      {insufficientForQueue && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-semibold text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-bold text-white">Saldo Insuficiente para Cobrir a Fila</p>
            <p className="text-amber-200/80 mt-0.5">
              O saldo atual da carteira ({balancePol?.toFixed(4)} POL) é inferior ao necessário para enviar todos os saques aprovados ({status.pendingApprovedPol.toFixed(4)} POL + taxas de gás). Reabasteça a carteira.
            </p>
          </div>
        </div>
      )}

      {/* Grid de Informações */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Endereço da Carteira */}
        <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-4 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Endereço da Hot Wallet
          </p>
          {status.address ? (
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold text-amber-300 truncate" title={status.address}>
                {status.address.slice(0, 8)}...{status.address.slice(-6)}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => status.address && void copyAddress(status.address)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                  title="Copiar endereço"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <a
                  href={`https://polygonscan.com/address/${status.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-sky-400 transition-colors"
                  title="Ver no Polygonscan"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ) : (
            <span className="text-xs text-rose-400 font-semibold">Não configurada</span>
          )}
        </div>

        {/* Saldo da Carteira */}
        <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-4 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Saldo Atual na Carteira
          </p>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-xl font-black tabular-nums ${
                balancePol == null
                  ? 'text-slate-500'
                  : isLowBalance
                    ? 'text-rose-400'
                    : 'text-emerald-400'
              }`}
            >
              {balancePol != null ? balancePol.toFixed(4) : '—'}
            </span>
            <span className="text-xs font-bold text-slate-400">POL</span>
          </div>
          <p className="text-[10px] text-slate-500 font-medium">
            Reserva mínima: {status.minReservePol} POL
          </p>
        </div>

        {/* Fila Aprovada para Envio */}
        <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-4 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Fila Aprovada (Auto-Send)
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black text-white tabular-nums">
              {status.pendingApprovedCount}
            </span>
            <span className="text-xs text-slate-400 font-medium">
              saque(s)
            </span>
            <span className="text-xs font-bold text-amber-300">
              ({status.pendingApprovedPol.toFixed(2)} POL)
            </span>
          </div>
          <p className="text-[10px] text-slate-500 font-medium">
            {status.canCoverPending ? (
              <span className="text-emerald-400 inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Saldo suficiente para a fila
              </span>
            ) : status.pendingApprovedCount === 0 ? (
              'Nenhum saque aguardando envio'
            ) : (
              <span className="text-rose-400 inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Saldo insuficiente
              </span>
            )}
          </p>
        </div>

        {/* Rota de Liquidação */}
        <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-4 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Rota de Liquidação
          </p>
          <p className="text-xs font-bold text-white">
            {status.viaCoinEx ? 'CoinEx Exchange API' : 'Hot Wallet Direta (Polygon)'}
          </p>
          <p className="text-[10px] text-slate-500">
            Ciclo do cron: a cada 2 minutos (120s)
          </p>
        </div>
      </div>
    </div>
  );
};
