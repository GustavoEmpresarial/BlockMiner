import type { ClientErrorCategory, Criticality } from '../adminClientErrors.types';

// eslint-disable-next-line react-refresh/only-export-components -- shared style map for the two badges below.
export const CRITICALITY_STYLES: Record<
  Criticality,
  { label: string; chip: string; dot: string; ring: string }
> = {
  critical: {
    label: 'Crítico',
    chip: 'bg-red-500/15 text-red-300 border-red-500/30',
    dot: 'bg-red-500',
    ring: 'text-red-400 bg-red-500/15',
  },
  high: {
    label: 'Alto',
    chip: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    dot: 'bg-orange-500',
    ring: 'text-orange-400 bg-orange-500/15',
  },
  warning: {
    label: 'Aviso',
    chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-500',
    ring: 'text-amber-400 bg-amber-500/15',
  },
  info: {
    label: 'Info',
    chip: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    dot: 'bg-slate-500',
    ring: 'text-slate-400 bg-slate-500/15',
  },
};

const CATEGORY_LABEL: Record<ClientErrorCategory, string> = {
  crash: 'crash',
  api_failure: 'api failure',
};

export function CriticalityBadge({ criticality }: { criticality: Criticality }) {
  const s = CRITICALITY_STYLES[criticality];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${s.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function CategoryBadge({ category }: { category: ClientErrorCategory }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
        category === 'crash' ? 'bg-red-500/15 text-red-300' : 'bg-sky-500/15 text-sky-300'
      }`}
    >
      {CATEGORY_LABEL[category]}
    </span>
  );
}
