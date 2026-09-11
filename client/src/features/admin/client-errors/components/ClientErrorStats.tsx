import type { ReactNode } from 'react';
import { Users, UserX, Activity } from 'lucide-react';
import type { ClientErrorStats as Stats } from '../adminClientErrors.types';
import { actorLabel, formatTime, CRITICALITIES } from '../adminClientErrors.logic';
import { CRITICALITY_STYLES } from './CriticalityBadge';

export function ClientErrorStatsPanel({ stats }: { stats: Stats }) {
  if (stats.total === 0) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {/* Criticality breakdown */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
        <p className="mb-3 text-[10px] font-black uppercase tracking-wider text-slate-500">
          Por criticidade
        </p>
        <div className="space-y-2">
          {CRITICALITIES.map((c) => {
            const n = stats.byCriticality[c];
            const pct = stats.total > 0 ? Math.round((n / stats.total) * 100) : 0;
            const s = CRITICALITY_STYLES[c];
            return (
              <div key={c} className="flex items-center gap-2">
                <span className="w-16 text-[11px] text-slate-400">{s.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div className={`h-full ${s.dot}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 text-right text-[11px] font-mono text-slate-300">{n}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actors */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
        <p className="mb-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Alcance</p>
        <div className="grid grid-cols-2 gap-3">
          <Stat icon={<Activity className="h-4 w-4 text-sky-400" />} label="Eventos" value={stats.total} />
          <Stat icon={<Users className="h-4 w-4 text-emerald-400" />} label="Usuários" value={stats.affectedUsers} />
          <Stat icon={<UserX className="h-4 w-4 text-slate-400" />} label="Anônimos" value={stats.anonymousEvents} />
          <Stat
            icon={<span className="text-red-400">●</span>}
            label="Crashes"
            value={stats.byCategory.crash}
          />
        </div>
        {stats.firstAt && stats.lastAt && (
          <p className="mt-3 text-[10px] text-slate-500">
            {formatTime(stats.firstAt)} → {formatTime(stats.lastAt)}
          </p>
        )}
      </div>

      {/* Top endpoints + users */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
        <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
          Endpoints mais afetados
        </p>
        <ul className="space-y-1">
          {stats.topEndpoints.map((e) => (
            <li key={e.endpoint} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate font-mono text-slate-300">{e.endpoint}</span>
              <span className="shrink-0 rounded bg-slate-800 px-1.5 font-mono text-slate-400">{e.count}</span>
            </li>
          ))}
        </ul>
        {stats.topUsers.length > 0 && (
          <>
            <p className="mb-1 mt-3 text-[10px] font-black uppercase tracking-wider text-slate-500">
              Mais atingidos
            </p>
            <ul className="space-y-1">
              {stats.topUsers.map((u, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate text-slate-300">{actorLabel({ user: u.user, ip: u.ip, key: '' })}</span>
                  <span className="shrink-0 rounded bg-slate-800 px-1.5 font-mono text-slate-400">{u.count}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-800/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-0.5 text-lg font-black text-white">{value}</p>
    </div>
  );
}
