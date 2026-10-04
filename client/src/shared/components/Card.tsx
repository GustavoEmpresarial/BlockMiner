import type { ElementType, HTMLAttributes, ReactNode } from 'react';

export type CardVariant = 'default' | 'table' | 'interactive';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: CardVariant;
  glow?: boolean;
  glowColor?: string;
  children?: ReactNode;
}

export default function Card({
  as: Component = 'div',
  variant = 'default',
  glow = false,
  glowColor = 'border-primary/40 shadow-[0_0_20px_rgba(59,130,246,0.15),4px_4px_0px_#000000]',
  className = '',
  children,
  ...props
}: CardProps) {
  const baseClasses = 'rounded-3xl border-2 border-slate-800 bg-slate-900/60 shadow-[4px_4px_0px_#000000] overflow-hidden';

  const variantClasses = {
    default: 'p-5 sm:p-6 space-y-4',
    table: '',
    interactive: 'p-5 sm:p-6 space-y-4 hover:border-slate-700 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer',
  }[variant];

  const glowClasses = glow ? glowColor : '';

  return (
    <Component
      data-testid="card"
      className={`${baseClasses} ${variantClasses} ${glowClasses} ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}
