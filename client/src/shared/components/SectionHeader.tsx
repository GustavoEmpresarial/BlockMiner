import type { LucideIcon } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import IconBadge, { type IconBadgeVariant, type IconBadgeSize } from './IconBadge';

export interface SectionHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: LucideIcon;
  iconVariant?: IconBadgeVariant;
  iconSize?: IconBadgeSize;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export default function SectionHeader({
  icon,
  iconVariant = 'primary',
  iconSize = 'md',
  title,
  subtitle,
  action,
  className = '',
  ...props
}: SectionHeaderProps) {
  return (
    <div
      data-testid="section-header"
      className={`flex items-center gap-2.5 pb-2 border-b border-slate-800/80 flex-wrap ${className}`.trim()}
      {...props}
    >
      {icon && <IconBadge icon={icon} variant={iconVariant} size={iconSize} />}
      <div className="min-w-0">
        <h2 className="text-xs sm:text-sm font-black text-slate-300 uppercase tracking-widest truncate">
          {title}
        </h2>
        {subtitle && <p className="text-[11px] text-slate-400 font-medium">{subtitle}</p>}
      </div>
      {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
    </div>
  );
}
