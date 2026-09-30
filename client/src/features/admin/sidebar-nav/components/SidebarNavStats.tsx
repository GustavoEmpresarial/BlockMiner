import React from 'react';
import { Layers, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import type { SidebarPersistedEntry } from '../adminSidebarNav.types';

interface SidebarNavStatsProps {
  entries: SidebarPersistedEntry[];
}

export const SidebarNavStats: React.FC<SidebarNavStatsProps> = ({ entries }) => {
  const total = entries.length;
  const active = entries.filter((e) => e.visible).length;
  const inactive = total - active;
  const locked = entries.filter((e) => e.parentItemId === null).length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-slate-400">
          <Layers className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-medium uppercase tracking-wider">Total de Itens</span>
        </div>
        <p className="mt-2 text-2xl font-black text-white">{total}</p>
        <p className="text-[11px] text-slate-500">Módulos no catálogo do app</p>
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-emerald-400">
          <Eye className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wider">Ativos / Visíveis</span>
        </div>
        <p className="mt-2 text-2xl font-black text-emerald-400">{active}</p>
        <p className="text-[11px] text-emerald-600/80">Liberados para os jogadores</p>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-amber-400">
          <EyeOff className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wider">Desativados</span>
        </div>
        <p className="mt-2 text-2xl font-black text-amber-400">{inactive}</p>
        <p className="text-[11px] text-amber-500/80">Kill Switch 403 ativo</p>
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-cyan-400">
          <ShieldAlert className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wider">Itens Raiz</span>
        </div>
        <p className="mt-2 text-2xl font-black text-cyan-400">{locked}</p>
        <p className="text-[11px] text-cyan-500/80">Menu de primeiro nível</p>
      </div>
    </div>
  );
};
