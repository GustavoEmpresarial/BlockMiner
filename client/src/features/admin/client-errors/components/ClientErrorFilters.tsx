import { Search, X } from 'lucide-react';
import type {
  ClientErrorCategory,
  ClientErrorFilters as Filters,
  Criticality,
} from '../adminClientErrors.types';
import { CRITICALITIES, CATEGORIES } from '../adminClientErrors.logic';
import { CRITICALITY_STYLES } from './CriticalityBadge';

const CATEGORY_LABEL: Record<ClientErrorCategory, string> = {
  crash: 'Crashes',
  api_failure: 'Falhas de API',
};

export function ClientErrorFilters({
  filters,
  counts,
  onChange,
  matched,
  total,
}: {
  filters: Filters;
  counts: Record<Criticality, number>;
  matched: number;
  total: number;
  onChange: (next: Filters) => void;
}) {
  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const hasActive =
    filters.criticalities.size > 0 || filters.categories.size > 0 || filters.search.trim() !== '';

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {CRITICALITIES.map((c) => {
          const active = filters.criticalities.has(c);
          const s = CRITICALITY_STYLES[c];
          return (
            <button
              key={c}
              onClick={() => onChange({ ...filters, criticalities: toggle(filters.criticalities, c) })}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition ${
                active ? s.chip : 'border-white/10 bg-slate-800/40 text-slate-400 hover:bg-white/5'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
              {s.label}
              <span className="font-mono opacity-70">{counts[c]}</span>
            </button>
          );
        })}
        <span className="mx-1 h-5 w-px bg-white/10" />
        {CATEGORIES.map((cat) => {
          const active = filters.categories.has(cat);
          return (
            <button
              key={cat}
              onClick={() => onChange({ ...filters, categories: toggle(filters.categories, cat) })}
              className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${
                active
                  ? 'border-sky-500/30 bg-sky-500/15 text-sky-300'
                  : 'border-white/10 bg-slate-800/40 text-slate-400 hover:bg-white/5'
              }`}
            >
              {CATEGORY_LABEL[cat]}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Buscar por usuário, endpoint, IP, status, requestId…"
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-500/40 focus:outline-none"
          />
        </div>
        {hasActive && (
          <button
            onClick={() =>
              onChange({ criticalities: new Set(), categories: new Set(), search: '' })
            }
            className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-slate-800/60 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
          >
            <X className="h-3.5 w-3.5" />
            Limpar
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        Mostrando <span className="text-slate-300">{matched}</span> de{' '}
        <span className="text-slate-300">{total}</span> eventos
        {hasActive ? ' (filtrado)' : ''}.
      </p>
    </div>
  );
}
