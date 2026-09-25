import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trophy,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { resolveApiErrorMessage } from '../../../shared/utils/apiErrorI18n';
import { tournamentsAdminApi } from './tournaments.admin.api';
import { applyPresetToForm, TOURNAMENT_PRESETS } from './tournaments.presets';
import {
  draftToApiPrize,
  emptyForm,
  prizeRowToDraft,
  seriesKey,
  toLocalInputValue,
  TOURNAMENT_METRICS,
  TOURNAMENT_TYPES,
  type AdminTournament,
  type TournamentFormState,
  type TournamentMetric,
} from './tournaments.admin.types';
import { TournamentCard } from './components/TournamentCard';
import { TournamentForm } from './components/TournamentForm';
import { TournamentSeriesCard } from './components/TournamentSeriesCard';
import { TournamentInspectPanel } from './components/TournamentInspectPanel';

type ListTab = 'live' | 'history' | 'all';

function statusMatchesTab(status: string, tab: ListTab): boolean {
  if (tab === 'all') return true;
  if (tab === 'live') return status === 'ACTIVE' || status === 'SCHEDULED';
  return status === 'ENDED' || status === 'CANCELLED';
}

export default function AdminTournamentsPage() {
  const { t } = useTranslation();
  const [tournaments, setTournaments] = useState<AdminTournament[]>([]);
  const [typeOrder, setTypeOrder] = useState<string[]>([...TOURNAMENT_TYPES]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  // Form & Modals
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<TournamentFormState>(emptyForm);
  const [inspect, setInspect] = useState<AdminTournament | null>(null);

  // Collapsible sections
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);

  // Filters
  const [tab, setTab] = useState<ListTab>('live');
  const [filterType, setFilterType] = useState<string>('');
  const [filterMetric, setFilterMetric] = useState<string>('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, orderRes] = await Promise.all([
        tournamentsAdminApi.list(),
        tournamentsAdminApi.getDisplayOrder(),
      ]);
      if (!listRes.data.ok) throw new Error(listRes.data.message);
      setTournaments(listRes.data.tournaments ?? []);
      if (orderRes.data.ok && orderRes.data.typeOrder?.length) {
        setTypeOrder(orderRes.data.typeOrder);
      }
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, t('adminManaged.load_error')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const active = tournaments.filter((x) => x.status === 'ACTIVE').length;
    const scheduled = tournaments.filter((x) => x.status === 'SCHEDULED').length;
    const recurring = tournaments.filter(
      (x) => x.recurring && (x.status === 'ACTIVE' || x.status === 'SCHEDULED'),
    ).length;
    const history = tournaments.filter(
      (x) => x.status === 'ENDED' || x.status === 'CANCELLED',
    ).length;
    return { active, scheduled, recurring, history, total: tournaments.length };
  }, [tournaments]);

  const series = useMemo(() => {
    const map = new Map<string, AdminTournament>();
    for (const row of tournaments) {
      if (!row.recurring) continue;
      if (row.status !== 'ACTIVE' && row.status !== 'SCHEDULED') continue;
      const key = seriesKey(row);
      const prev = map.get(key);
      if (!prev || new Date(row.startsAt).getTime() > new Date(prev.startsAt).getTime()) {
        map.set(key, row);
      }
    }
    return [...map.values()].sort(
      (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
    );
  }, [tournaments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tournaments.filter((row) => {
      if (!statusMatchesTab(row.status, tab)) return false;
      if (filterType && row.type !== filterType) return false;
      if (filterMetric && row.metric !== filterMetric) return false;
      if (q && !row.name.toLowerCase().includes(q) && !String(row.id).includes(q)) return false;
      return true;
    });
  }, [tournaments, tab, filterType, filterMetric, search]);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (row: AdminTournament) => {
    setEditId(row.id);
    setForm({
      name: row.name,
      description: row.description ?? '',
      type: row.type,
      metric: (TOURNAMENT_METRICS.includes(row.metric as TournamentMetric)
        ? row.metric
        : 'OFFERS_ALL') as TournamentMetric,
      startsAt: toLocalInputValue(row.startsAt),
      endsAt: toLocalInputValue(row.endsAt),
      recurring: Boolean(row.recurring),
      prizes: (row.prizes ?? []).map(prizeRowToDraft),
    });
    setShowForm(true);
  };

  const applyPreset = (presetId: string) => {
    const preset = TOURNAMENT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setEditId(null);
    setForm(applyPresetToForm(preset, emptyForm()));
    setShowForm(true);
    setPresetsOpen(false);
  };

  const handleSaveForm = async (data: TournamentFormState) => {
    setSaving(true);
    try {
      const body = {
        name: data.name.trim(),
        description: data.description.trim() || undefined,
        type: data.type,
        metric: data.metric,
        startsAt: new Date(data.startsAt).toISOString(),
        endsAt: new Date(data.endsAt).toISOString(),
        recurring: data.recurring,
        prizes: data.prizes.map(draftToApiPrize),
      };
      const res = editId
        ? await tournamentsAdminApi.update(editId, body)
        : await tournamentsAdminApi.create(body);
      if (!res.data.ok) throw new Error(res.data.message);
      toast.success(t('adminManaged.saved'));
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm());
      await load();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, t('adminManaged.save_error')));
    } finally {
      setSaving(false);
    }
  };

  const moveOrder = (index: number, dir: -1 | 1) => {
    const next = [...typeOrder];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setTypeOrder(next);
  };

  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      const { data } = await tournamentsAdminApi.setDisplayOrder(typeOrder);
      if (!data.ok) throw new Error(data.message);
      setTypeOrder(data.typeOrder ?? typeOrder);
      toast.success(t('adminManaged.saved'));
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, t('adminManaged.save_error')));
    } finally {
      setSavingOrder(false);
    }
  };

  const handleFinalize = async (row: AdminTournament) => {
    try {
      const { data } = await tournamentsAdminApi.finalize(row.id);
      if (!data.ok) throw new Error(data.message);
      toast.success(
        t('adminTournaments.finalized', {
          ranked: 'ranked' in data ? data.ranked ?? 0 : 0,
          rewarded: 'rewarded' in data ? data.rewarded ?? 0 : 0,
        }),
      );
      await load();
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, t('adminManaged.action_error')));
    }
  };

  const handleCancel = async (row: AdminTournament) => {
    try {
      const { data } = await tournamentsAdminApi.cancel(row.id);
      if (!data.ok) throw new Error(data.message);
      toast.success(t('adminTournaments.cancelled'));
      await load();
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, t('adminManaged.action_error')));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-sm shadow-amber-500/10">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">{t('adminTournaments.title')}</h1>
            <p className="text-xs text-slate-500">
              {loading ? 'Carregando…' : `${tournaments.length} torneio(s) cadastrado(s)`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-900 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            aria-label={t('adminManaged.refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-colors shadow-md shadow-amber-500/10"
          >
            <Plus className="w-4 h-4" />
            <span>{t('adminManaged.create')}</span>
          </button>
        </div>
      </header>

      {/* Stat Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            {t('adminTournaments.stat_active')}
          </p>
          <p className="mt-1 text-2xl font-black text-emerald-400">{counts.active}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            {t('adminTournaments.stat_scheduled')}
          </p>
          <p className="mt-1 text-2xl font-black text-sky-400">{counts.scheduled}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            {t('adminTournaments.stat_recurring')}
          </p>
          <p className="mt-1 text-2xl font-black text-amber-400">{counts.recurring}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            {t('adminTournaments.stat_history')}
          </p>
          <p className="mt-1 text-2xl font-black text-slate-400">{counts.history}</p>
        </div>
      </div>

      {/* Presets (Collapsible) */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden">
        <button
          type="button"
          onClick={() => setPresetsOpen((v) => !v)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-800/40 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-white">
              {t('adminTournaments.presets_title')}
            </h3>
            <span className="text-[10px] text-slate-500 font-normal">
              (12 modelos prontos com escadas de prêmios)
            </span>
          </div>
          {presetsOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {presetsOpen ? (
          <div className="p-4 pt-0 border-t border-slate-800/60">
            <p className="text-xs text-slate-400 mb-3 mt-3">{t('adminTournaments.presets_hint')}</p>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {TOURNAMENT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3 text-left hover:border-amber-500/40 hover:bg-amber-500/10 transition-colors group"
                >
                  <p className="text-xs font-black text-amber-300 group-hover:text-amber-200">
                    {t(preset.labelKey)}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-slate-500">{t(preset.hintKey)}</p>
                  <p className="mt-2 font-mono text-[10px] text-slate-600">
                    {preset.type} · {preset.metric}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* Recurring series */}
      {series.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                {t('adminTournaments.series_title')} ({series.length})
              </h3>
              <p className="text-[11px] text-slate-500">{t('adminTournaments.series_hint')}</p>
            </div>
          </div>
          <div className="grid gap-2.5 lg:grid-cols-2">
            {series.map((row) => (
              <TournamentSeriesCard
                key={seriesKey(row)}
                tournament={row}
                onEdit={openEdit}
                onInspect={(t) => setInspect(t)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Display order settings (Collapsible) */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setOrderOpen((v) => !v)}
            className="flex items-center gap-2 text-left"
          >
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
              {t('adminTournaments.display_order')}
            </h3>
            {orderOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>
          {orderOpen ? (
            <button
              type="button"
              disabled={savingOrder}
              onClick={() => void saveOrder()}
              className="rounded-xl bg-slate-100 hover:bg-white px-3 py-1.5 text-xs font-black text-slate-950 disabled:opacity-50 transition-colors"
            >
              {savingOrder ? t('adminManaged.saving') : t('adminManaged.save')}
            </button>
          ) : null}
        </div>

        {orderOpen ? (
          <div className="mt-3 pt-3 border-t border-slate-800/80">
            <p className="text-[11px] text-slate-500 mb-2">
              {t('adminTournaments.display_order_hint')}
            </p>
            <div className="flex flex-wrap gap-2">
              {typeOrder.map((type, index) => (
                <div
                  key={type}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1"
                >
                  <span className="font-mono text-xs font-bold text-amber-300">{type}</span>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveOrder(index, -1)}
                    className="rounded p-0.5 text-slate-400 hover:text-white disabled:opacity-20"
                    aria-label={t('adminTournaments.move_up')}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === typeOrder.length - 1}
                    onClick={() => moveOrder(index, 1)}
                    className="rounded p-0.5 text-slate-400 hover:text-white disabled:opacity-20"
                    aria-label={t('adminTournaments.move_down')}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* Filters + List */}
      <section className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-2xl w-fit">
            {(
              [
                ['live', t('adminTournaments.tab_live')],
                ['history', t('adminTournaments.tab_history')],
                ['all', t('adminTournaments.tab_all')],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                  tab === id
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('adminTournaments.search_placeholder')}
            className="input-admin w-full bg-slate-900 border-slate-700/80 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="input-admin w-full bg-slate-900 border-slate-700/80 rounded-xl px-3.5 py-2 text-sm text-white"
          >
            <option value="">{t('adminTournaments.filter_all_types')}</option>
            {TOURNAMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={filterMetric}
            onChange={(e) => setFilterMetric(e.target.value)}
            className="input-admin w-full bg-slate-900 border-slate-700/80 rounded-xl px-3.5 py-2 text-sm text-white"
          >
            <option value="">{t('adminTournaments.filter_all_metrics')}</option>
            {TOURNAMENT_METRICS.map((metric) => (
              <option key={metric} value={metric}>
                {metric}
              </option>
            ))}
          </select>
        </div>

        {/* Tournament Cards Stack */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-slate-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 py-16 text-center">
            <XCircle className="mb-2 h-8 w-8 text-slate-700" />
            <p className="text-sm font-bold text-slate-500">{t('adminManaged.empty')}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((row) => (
              <TournamentCard
                key={row.id}
                tournament={row}
                onInspect={(item) => setInspect(item)}
                onEdit={openEdit}
                onFinalize={handleFinalize}
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}
      </section>

      {/* Form Modal */}
      <TournamentForm
        open={showForm}
        editId={editId}
        initial={form}
        onSave={handleSaveForm}
        onClose={() => {
          setShowForm(false);
          setEditId(null);
        }}
        isSaving={saving}
      />

      {/* Inspect Side Drawer */}
      {inspect ? (
        <TournamentInspectPanel
          tournament={inspect}
          onClose={() => setInspect(null)}
          onChanged={() => void load()}
        />
      ) : null}
    </div>
  );
}
