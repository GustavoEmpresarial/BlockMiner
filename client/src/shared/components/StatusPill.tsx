import type { LucideIcon } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';

export type StatusPillVariant = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'cyan' | 'orange' | 'neutral';

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: StatusPillVariant;
  icon?: LucideIcon;
  label: ReactNode;
}

const VARIANT_STYLES: Record<StatusPillVariant, string> = {
  success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  danger: 'bg-red-500/10 border-red-500/30 text-red-400',
  info: 'bg-sky-500/10 border-sky-500/30 text-sky-400',
  primary: 'bg-primary/10 border-primary/30 text-primary',
  cyan: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
  orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
  neutral: 'bg-slate-800 border-slate-700 text-slate-300',
};

export default function StatusPill({
  variant = 'neutral',
  icon: Icon,
  label,
  className = '',
  ...props
}: StatusPillProps) {
  const variantClass = VARIANT_STYLES[variant];

  return (
    <span
      data-testid="status-pill"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide border shadow-sm ${variantClass} ${className}`.trim()}
      {...props}
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
}
