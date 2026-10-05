import type { ElementType, HTMLAttributes, ReactNode } from 'react';

export type CardVariant = 'default' | 'table' | 'interactive' | 'flat' | 'ghost' | 'compact';
export type CardSpacing = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: CardVariant;
  glow?: boolean;
  glowColor?: string;
  overflowHidden?: boolean;
  overflow?: boolean | 'hidden' | 'auto' | 'visible';
  spacing?: boolean | CardSpacing;
  children?: ReactNode;
}

export default function Card({
  as: Component = 'div',
  variant = 'default',
  glow = false,
  glowColor = 'border-primary/40 shadow-[0_0_20px_rgba(59,130,246,0.15),4px_4px_0px_#000000]',
  overflowHidden = false,
  overflow,
  spacing,
  className = '',
  children,
  ...props
}: CardProps) {
  const baseClasses = 'rounded-3xl border-2 border-slate-800 bg-slate-900/60 shadow-[4px_4px_0px_#000000]';

  const shouldOverflowHidden =
    variant === 'table' ||
    overflowHidden ||
    overflow === true ||
    overflow === 'hidden';

  const overflowClass = shouldOverflowHidden
    ? 'overflow-hidden'
    : overflow === 'auto'
      ? 'overflow-auto'
      : overflow === 'visible'
        ? 'overflow-visible'
        : '';

  const paddingClasses = {
    default: 'p-5 sm:p-6',
    table: '',
    interactive: 'p-5 sm:p-6 hover:border-slate-700 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer',
    flat: 'p-5 sm:p-6 !shadow-none',
    ghost: 'p-5 sm:p-6 !bg-transparent !border-dashed !shadow-none',
    compact: 'p-3.5 sm:p-4',
  }[variant];

  const spacingClass = (() => {
    if (spacing === true || spacing === 'md') return 'space-y-4';
    if (spacing === 'sm') return 'space-y-2';
    if (spacing === 'lg') return 'space-y-6';
    return '';
  })();

  const glowClasses = glow ? glowColor : '';

  return (
    <Component
      data-testid="card"
      className={`${baseClasses} ${paddingClasses} ${spacingClass} ${overflowClass} ${glowClasses} ${className}`.replace(/\s+/g, ' ').trim()}
      {...props}
    >
      {children}
    </Component>
  );
}
