import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { clearAdminClientErrors, listAdminClientErrors, readAxiosResponseMessage } from '../lib/admin.api';
import type { ClientErrorFilters, DecoratedRow } from './adminClientErrors.types';
import {
  buildClipboardText,
  computeStats,
  decorateAll,
  emptyCriticalityCounts,
  filterRows,
  groupByUser,
} from './adminClientErrors.logic';
import { ClientErrorFilters as FiltersPanel } from './components/ClientErrorFilters';
import { ClientErrorStatsPanel } from './components/ClientErrorStats';
import { ClientErrorCard } from './components/ClientErrorCard';
import { CriticalityBadge } from './components/CriticalityBadge';
import { actorLabel } from './adminClientErrors.logic';

const DEFAULT_FILTERS: ClientErrorFilters = {
  criticalities: new Set(),
  categories: new Set(),
  search: '',
};

export default function AdminClientErrorsPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [raw, setRaw] = useState<DecoratedRow[]>([]);
  const [filters, setFilters] = useState<ClientErrorFilters>(DEFAULT_FILTERS);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdminClientErrors(500);
      if (!res.data?.ok) throw new Error(res.data?.message ?? t('adminSystem.load_error'));
      setRaw(decorateAll(res.data.items ?? []));
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? t('adminSystem.load_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => filterRows(raw, filters), [raw, filters]);
  const stats = useMemo(() => computeStats(raw), [raw]);
  const critCounts = useMemo(() => {
    const c = emptyCriticalityCounts();
    for (const r of raw) c[r.criticality] += 1;
    return c;
  }, [raw]);
  const groups = useMemo(() => groupByUser(filtered), [filtered]);

  const clear = async () => {
    if (!confirm(t('adminSystem.confirm_clear_errors'))) return;
    setClearing(true);
    try {
      const res = await clearAdminClientErrors();
      if (!res.data?.ok) throw new Error(res.data?.message);
      setRaw([]);
      toast.success(t('adminSystem.cleared'));
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? t('adminSystem.action_error'));
    } finally {
      setClearing(false);
    }
  };

  const onCopy = async (row: DecoratedRow) => {
    try {
      await navigator.clipboard.writeText(buildClipboardText(row));
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error(t('adminSystem.action_error'));
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">{t('adminSystem.client_errors')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('adminSystem.client_errors_subtitle', { count: raw.length })}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('adminSystem.refresh')}
          </button>
          <button
            type="button"
            onClick={() => void clear()}
            disabled={clearing || raw.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-300 disabled:opacity-40"
          >
            {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {t('adminSystem.clear_all')}
          </button>
        </div>
      </header>

      <ClientErrorStatsPanel stats={stats} />

      <FiltersPanel
        filters={filters}
        counts={critCounts}
        matched={filtered.length}
        total={raw.length}
        onChange={setFilters}
      />

      {loading ? (
        <div className="flex justify-center py-20 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <p className="py-12 text-center text-slate-500">{t('adminSystem.empty')}</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const open = expanded === g.key;
            return (
              <section key={g.key} className="rounded-2xl border border-white/10 bg-slate-900/40">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : g.key)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5"
                >
                  <CriticalityBadge criticality={g.worst} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-white">{actorLabel(g)}</p>
                    <p className="text-[11px] text-slate-500">
                      {g.rows.length} evento(s) · último {new Date(g.lastAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </button>
                {open ? (
                  <div className="space-y-3 border-t border-white/5 p-4">
                    {g.rows.map((row) => (
                      <ClientErrorCard
                        key={row.id}
                        row={row}
                        copied={copiedId === row.id}
                        onCopy={onCopy}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
