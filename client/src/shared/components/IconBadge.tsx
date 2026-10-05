import type { LucideIcon } from 'lucide-react';
import type { HTMLAttributes } from 'react';

export type IconBadgeVariant = 'primary' | 'emerald' | 'amber' | 'violet' | 'sky' | 'cyan' | 'orange' | 'red' | 'neutral';
export type IconBadgeSize = 'sm' | 'md' | 'lg';

export interface IconBadgeProps extends HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  variant?: IconBadgeVariant;
  size?: IconBadgeSize;
}

const VARIANT_STYLES: Record<IconBadgeVariant, string> = {
  primary: 'bg-primary/10 border-primary/25 text-primary',
  emerald: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400',
  amber: 'bg-amber-500/10 border-amber-500/25 text-amber-400',
  violet: 'bg-violet-500/10 border-violet-500/25 text-violet-400',
  sky: 'bg-sky-500/10 border-sky-500/25 text-sky-400',
  cyan: 'bg-cyan-500/10 border-cyan-500/25 text-cyan-400',
  orange: 'bg-orange-500/10 border-orange-500/25 text-orange-400',
  red: 'bg-red-500/10 border-red-500/25 text-red-400',
  neutral: 'bg-slate-800/80 border-slate-700/60 text-slate-400',
};

const SIZE_STYLES: Record<IconBadgeSize, { container: string; icon: string }> = {
  sm: {
    container: 'w-7 h-7 rounded-lg shadow-[2px_2px_0px_#000000]',
    icon: 'w-3.5 h-3.5',
  },
  md: {
    container: 'w-8 h-8 rounded-xl shadow-[2px_2px_0px_#000000]',
    icon: 'w-4 h-4',
  },
  lg: {
    container: 'w-10 h-10 rounded-2xl shadow-[2px_2px_0px_#000000]',
    icon: 'w-5 h-5',
  },
};

export default function IconBadge({
  icon: Icon,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: IconBadgeProps) {
  const sizeStyle = SIZE_STYLES[size];
  const variantStyle = VARIANT_STYLES[variant];

  return (
    <div
      data-testid="icon-badge"
      className={`shrink-0 flex items-center justify-center border ${sizeStyle.container} ${variantStyle} ${className}`}
      {...props}
    >
      <Icon className={sizeStyle.icon} aria-hidden="true" />
    </div>
  );
}
