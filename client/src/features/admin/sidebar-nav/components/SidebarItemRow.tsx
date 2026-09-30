import React from 'react';
import { ArrowUp, ArrowDown, Lock, Eye, EyeOff, CornerDownRight } from 'lucide-react';
import { resolveSidebarIcon } from '../../../shell/utils/sidebarNavMap';
import type { SidebarAdminItemMeta, SidebarPersistedEntry } from '../adminSidebarNav.types';

interface SidebarItemRowProps {
  entry: SidebarPersistedEntry;
  meta?: SidebarAdminItemMeta;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleVisibility: () => void;
  isNested?: boolean;
}

const DEFAULT_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  power_stats: 'Poder & Estatísticas',
  machines: 'Minhas Máquinas',
  inventario: 'Inventário Geral',
  shop: 'Loja',
  offers: 'Ofertas & Eventos',
  wallet: 'Carteira & Saldo',
  taxes: 'Taxa de Energia',
  support: 'Suporte',
  tournaments: 'Torneios & Ligas',
  checkin: 'Check-in Diário',
  daily_tasks: 'Missões Diárias',
  mini_pass: 'Mini Pass',
  burn: 'Evento de Queima',
  games: 'Jogos de Mineração',
  rewards_group: 'Grupo Recompensas',
  faucet: 'Faucet (Genesis)',
  internal_offerwall: 'Offerwall Interno',
  offerwall: 'Offerwall Externo',
  zerads: 'ZerAds (Embutido)',
  ptc_earn: 'PTC & Anúncios',
  shortlinks: 'Shortlinks',
  read_earn: 'Read & Earn',
  youtube: 'YouTube Rewards',
  auto_mining: 'Auto Mining',
  social_feed: 'Feed Social & Vídeos',
  creator: 'Programa de Criadores',
  referrals: 'Indicações & Afiliados',
  manual: 'Guia do Jogo',
  ranking: 'Classificação Geral',
  transparency: 'Portal Transparência',
  roadmap: 'Roadmap Público',
};

export const SidebarItemRow: React.FC<SidebarItemRowProps> = ({
  entry,
  meta,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
  isNested = false,
}) => {
  const Icon = resolveSidebarIcon(meta?.icon);
  const title = DEFAULT_TITLES[entry.itemId] || entry.itemId;
  const isZerads = entry.itemId === 'zerads';

  return (
    <div
      className={`group flex items-center justify-between gap-3 rounded-xl border p-3 transition-all ${
        entry.visible
          ? 'border-white/10 bg-slate-900/40 hover:border-white/20'
          : 'border-white/5 bg-slate-950/40 opacity-75 hover:opacity-100'
      } ${isNested ? 'ml-6 border-l-2 border-l-amber-500/30' : ''}`}
    >
      <div className="flex items-center gap-3">
        {isNested && <CornerDownRight className="h-4 w-4 shrink-0 text-amber-500/50" />}

        {/* Reordering Controls */}
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            title="Mover para cima"
            className="rounded p-0.5 text-slate-500 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-20"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            title="Mover para baixo"
            className="rounded p-0.5 text-slate-500 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-20"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>

        {/* Item Icon & Identity */}
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            entry.visible
              ? 'bg-amber-500/10 text-amber-400'
              : 'bg-slate-800 text-slate-500'
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{title}</span>
            <span className="font-mono text-[11px] text-slate-500">#{entry.itemId}</span>
            {meta?.parentLocked && (
              <span
                title="Parentesco travado pelo sistema"
                className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400"
              >
                <Lock className="h-2.5 w-2.5" />
                Fixo
              </span>
            )}
            {meta?.isGroup && (
              <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300">
                Grupo
              </span>
            )}
            {isZerads && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                Embutido no Offerwall
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-slate-400">
            <span>Ordem: <strong className="text-slate-300">{entry.sortOrder}</strong></span>
            {meta?.labelKey && (
              <span className="hidden text-slate-500 sm:inline">i18n: {meta.labelKey}</span>
            )}
          </div>
        </div>
      </div>

      {/* Visibility Toggle / Kill Switch */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isZerads}
          onClick={onToggleVisibility}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
            entry.visible
              ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
              : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
          } ${isZerads ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          title={
            isZerads
              ? 'ZerAds é permanentemente desativado na sidebar pois vive dentro do Offerwall.'
              : entry.visible
              ? 'Clique para ocultar e ativar o kill switch 403 neste módulo'
              : 'Clique para ativar e liberar a rota para os jogadores'
          }
        >
          {entry.visible ? (
            <>
              <Eye className="h-3.5 w-3.5" />
              <span>Visível</span>
            </>
          ) : (
            <>
              <EyeOff className="h-3.5 w-3.5" />
              <span>Oculto (403)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
