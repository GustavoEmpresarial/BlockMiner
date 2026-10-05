import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  accent?: string;
  border?: string;
  className?: string;
};

export default function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = 'text-white',
  border = 'border-slate-800 bg-slate-900/60',
  className = '',
}: Props) {
  return (
    <div className={`rounded-3xl border-2 p-4 sm:p-5 shadow-[4px_4px_0px_#000000] ${border} ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 truncate">{label}</p>
        {Icon ? (
          <div className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center border border-white/10 bg-slate-950/80 shadow-[2px_2px_0px_#000000]">
            <Icon className={`w-4 h-4 ${accent}`} aria-hidden="true" />
          </div>
        ) : null}
      </div>
      <p className={`text-2xl md:text-3xl font-black font-mono tabular-nums tracking-tight leading-none ${accent}`}>{value}</p>
      {sub ? <div className="mt-2 text-[11px] text-slate-400 leading-relaxed font-medium">{sub}</div> : null}
    </div>
  );
}
