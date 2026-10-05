import { isValidElement, type HTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon | ReactNode;
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
  glow?: boolean;
}

export default function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = 'text-primary',
  glow = false,
  className = '',
  ...props
}: StatCardProps) {
  const renderIcon = () => {
    if (isValidElement(Icon)) return Icon;
    if (
      typeof Icon === 'function' ||
      (typeof Icon === 'object' && Icon !== null && ('$$typeof' in (Icon as unknown as Record<string, unknown>) || 'render' in (Icon as unknown as Record<string, unknown>)))
    ) {
      const IconComponent = Icon as LucideIcon;
      return <IconComponent className={`w-4 h-4 ${accent}`} aria-hidden="true" />;
    }
    return Icon;
  };

  return (
    <div
      data-testid="stat-card"
      className={`relative rounded-2xl border-2 border-slate-800/80 bg-slate-900/60 p-4 sm:p-5 flex flex-col justify-between gap-2 overflow-hidden shadow-[4px_4px_0px_#000000] hover:border-slate-700 transition-all ${
        glow ? 'border-primary/40 shadow-[0_0_20px_rgba(59,130,246,0.15),4px_4px_0px_#000000]' : ''
      } ${className}`.trim()}
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400 uppercase tracking-wider font-extrabold truncate">
          {label}
        </span>
        <div
          className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center border border-white/10 shadow-[2px_2px_0px_#000000] ${
            glow ? 'bg-primary/15 border-primary/30' : 'bg-slate-950/80'
          }`}
        >
          {renderIcon()}
        </div>
      </div>
      <div>
        <div className="text-2xl font-black text-white leading-none font-mono tracking-tight">{value}</div>
        {sub && <div className="text-[11px] text-slate-400 mt-1.5 font-medium">{sub}</div>}
      </div>
    </div>
  );
}
