import { useState, type ElementType, type ReactNode } from 'react';
import type { DashboardBlockRow } from './dashboard.types';

export function safeDashboardNumber(value: unknown, decimals?: number): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  if (decimals !== undefined) return n.toFixed(decimals);
  return String(n);
}

export function parseBlockTime(value: unknown): Date | null {
  if (value == null) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDashboardBlockTime(block: DashboardBlockRow): string {
  try {
    const raw =
      block.timestamp ??
      (block as { createdAt?: unknown }).createdAt ??
      (block as { time?: unknown }).time;
    if (raw == null || raw === '') return '—';
    let d: Date;
    if (raw instanceof Date) {
      d = raw;
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      // Engine stores Date.now() (ms). Guard accidental seconds.
      d = new Date(raw < 1e12 ? raw * 1000 : raw);
    } else {
      const asNum = Number(raw);
      if (Number.isFinite(asNum) && String(raw).trim() !== '') {
        d = new Date(asNum < 1e12 ? asNum * 1000 : asNum);
      } else {
        d = new Date(String(raw));
      }
    }
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString();
  } catch {
    return '—';
  }
}

const CARD_COLOR_CLASS: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-400',
  cyan: 'bg-cyan-500/10 text-cyan-400',
  purple: 'bg-purple-500/10 text-purple-400',
  amber: 'bg-amber-500/10 text-amber-400',
  emerald: 'bg-emerald-500/10 text-emerald-400',
};

export type DashboardStatCardProps = {
  icon?: ElementType;
  logoUrl?: string | null;
  label: string;
  value: string | number;
  unit: string;
  color: keyof typeof CARD_COLOR_CLASS | string;
  headerExtra?: ReactNode;
};

export function Card({
  icon: Icon,
  logoUrl,
  label,
  value,
  unit,
  color,
  headerExtra,
  children,
  className = '',
}: DashboardStatCardProps & { children?: ReactNode; className?: string }) {
  if (children != null && label === undefined) {
    return (
      <div className={`rounded-3xl border border-gray-800/50 bg-surface p-6 ${className}`}>{children}</div>
    );
  }

  const tone = CARD_COLOR_CLASS[color] ?? CARD_COLOR_CLASS.blue;
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = Boolean(logoUrl && !logoFailed);

  return (
    <div className="bg-surface border border-gray-800/50 hover:border-gray-700/50 rounded-3xl p-5 md:p-6 shadow-lg transition-all group overflow-hidden relative h-full flex flex-col">
      <div
        className={`p-3 rounded-2xl ${tone} group-hover:scale-110 transition-transform duration-300 w-fit mb-4 relative z-10 overflow-hidden`}
      >
        {showLogo ? (
          <img
            src={logoUrl!}
            alt=""
            className="w-5 h-5 md:w-6 md:h-6 object-contain"
            onError={() => setLogoFailed(true)}
          />
        ) : Icon ? (
          <Icon className="w-5 h-5 md:w-6 md:h-6" />
        ) : (
          <span className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center text-[10px] font-black">
            {String(unit).slice(0, 1)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 mb-2 relative z-10">
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-snug">{label}</p>
        {headerExtra}
      </div>
      <div className="mt-auto relative z-10">
        <h3 className="text-xl sm:text-2xl md:text-[1.65rem] font-black text-white tracking-tight leading-none whitespace-nowrap">
          {value}{' '}
          <span className="text-xs font-bold text-gray-500 tracking-normal uppercase align-middle">{unit}</span>
        </h3>
      </div>
      <div className="absolute right-0 bottom-0 w-16 h-16 bg-gradient-to-br from-transparent to-gray-800/10 rounded-tl-3xl" />
    </div>
  );
}
