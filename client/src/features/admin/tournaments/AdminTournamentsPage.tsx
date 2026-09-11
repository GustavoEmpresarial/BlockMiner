import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trophy,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { resolveApiErrorMessage } from '../../../shared/utils/apiErrorI18n';
import { tournamentsAdminApi } from './tournaments.admin.api';
import TournamentInspectPanel from './TournamentInspectPanel';
import TournamentPrizeEditor from './TournamentPrizeEditor';
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
  type TournamentStatus,
  type TournamentType,
} from './tournaments.admin.types';

type ListTab = 'live' | 'history' | 'all';

const STATUS_CLASS: Record<TournamentStatus, string> = {
  ACTIVE: 'text-emerald-400',
  SCHEDULED: 'text-sky-400',
  ENDED: 'text-slate-500',
  CANCELLED: 'text-red-400/80',
};

function statusMatchesTab(status: TournamentStatus, tab: ListTab): boolean {
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
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<TournamentFormState>(emptyForm);
  const [inspect, setInspect] = useState<AdminTournament | null>(null);

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
    const history = tournaments.filter((x) => x.status === 'ENDED' || x.status === 'CANCELLED').length;
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
    return [...map.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
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
  };

  const field = <K extends keyof TournamentFormState>(key: K, value: TournamentFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    for (const p of form.prizes) {
      if (p.rankFrom < 1 || p.rankTo < p.rankFrom) {
        toast.error(t('adminTournaments.invalid_rank'));
        return;
      }
      if (p.prizeType === 'MACHINE' && !p.minerId) {
        toast.error(t('adminTournaments.miner_required'));
        return;
      }
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        type: form.type,
        metric: form.metric,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        recurring: form.recurring,
        prizes: form.prizes.map(draftToApiPrize),
      };
      const { data } = editId
        ? await tournamentsAdminApi.update(editId, body)
        : await tournamentsAdminApi.create(body);
      if (!data.ok) throw new Error(data.message);
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

  const quickAction = async (row: AdminTournament, action: 'finalize' | 'cancel') => {
    const confirmKey =
      action === 'finalize' ? 'adminTournaments.confirm_finalize' : 'adminTournaments.confirm_cancel';
    if (!confirm(t(confirmKey))) return;
    try {
      const { data } =
        action === 'finalize'
          ? await tournamentsAdminApi.finalize(row.id)
          : await tournamentsAdminApi.cancel(row.id);
      if (!data.ok) throw new Error(data.message);
      toast.success(action === 'finalize' ? t('adminTournaments.finalized_short') : t('adminTournaments.cancelled'));
      await load();
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, t('adminManaged.action_error')));
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black text-white">
            <Trophy className="h-6 w-6 text-amber-400" />
            {t('adminTournaments.title')}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{t('adminTournaments.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-slate-700 p-2 text-slate-300"
            aria-label={t('adminManaged.refresh')}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1 rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-slate-950"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('adminManaged.create')}
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label={t('adminTournaments.stat_active')} value={counts.active} accent="text-emerald-300" />
        <StatCard label={t('adminTournaments.stat_scheduled')} value={counts.scheduled} accent="text-sky-300" />
        <StatCard label={t('adminTournaments.stat_recurring')} value={counts.recurring} accent="text-amber-300" />
        <StatCard label={t('adminTournaments.stat_history')} value={counts.history} accent="text-slate-400" />
      </div>

      {/* Display order */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-white">{t('adminTournaments.display_order')}</h3>
            <p className="mt-1 text-xs text-slate-500">{t('adminTournaments.display_order_hint')}</p>
          </div>
          <button
            type="button"
            disabled={savingOrder}
            onClick={() => void saveOrder()}
            className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-950 disabled:opacity-50"
          >
            {savingOrder ? t('adminManaged.saving') : t('adminManaged.save')}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {typeOrder.map((type, index) => (
            <div
              key={type}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-950/60 px-2 py-1.5"
            >
              <span className="px-1 font-mono text-xs font-bold text-amber-200">{type}</span>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => moveOrder(index, -1)}
                className="rounded p-0.5 text-slate-400 hover:text-white disabled:opacity-30"
                aria-label={t('adminTournaments.move_up')}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={index === typeOrder.length - 1}
                onClick={() => moveOrder(index, 1)}
                className="rounded p-0.5 text-slate-400 hover:text-white disabled:opacity-30"
                aria-label={t('adminTournaments.move_down')}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Presets */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-sm font-black text-white">{t('adminTournaments.presets_title')}</h3>
        <p className="mt-1 text-xs text-slate-500">{t('adminTournaments.presets_hint')}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {TOURNAMENT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-3 py-3 text-left hover:border-amber-500/40 hover:bg-amber-500/10"
            >
              <p className="text-xs font-black text-amber-200">{t(preset.labelKey)}</p>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">{t(preset.hintKey)}</p>
              <p className="mt-2 font-mono text-[10px] text-slate-600">
                {preset.type} · {preset.metric}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Recurring series */}
      {series.length > 0 ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-sm font-black text-white">{t('adminTournaments.series_title')}</h3>
          <p className="mt-1 text-xs text-slate-500">{t('adminTournaments.series_hint')}</p>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {series.map((row) => (
              <div
                key={seriesKey(row)}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{row.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                    #{row.id} · {row.type} · {row.metric} ·{' '}
                    <span className={STATUS_CLASS[row.status]}>{row.status}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    {new Date(row.startsAt).toLocaleString()} → {new Date(row.endsAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="rounded-lg border border-amber-500/30 px-2 py-1 text-[11px] font-bold text-amber-300"
                  >
                    {t('adminTournaments.edit_series')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspect(row)}
                    className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300"
                  >
                    {t('adminTournaments.inspect')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Create / edit modal */}
      {showForm ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tournament-form-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) {
              setShowForm(false);
              setEditId(null);
            }
          }}
        >
          <form
            onSubmit={(e) => void submit(e)}
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-amber-500/25 bg-slate-900 shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <h3 id="tournament-form-title" className="text-sm font-black text-amber-200">
                {editId ? t('adminTournaments.edit_title') : t('adminTournaments.create_title')}
              </h3>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setShowForm(false);
                  setEditId(null);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
                aria-label={t('adminTournaments.close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-[10px] uppercase tracking-widest text-slate-500 md:col-span-2">
                  {t('adminTournaments.name')}
                  <input
                    required
                    value={form.name}
                    onChange={(e) => field('name', e.target.value)}
                    className="input-admin w-full"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300 md:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.recurring}
                    onChange={(e) => field('recurring', e.target.checked)}
                  />
                  {t('adminTournaments.recurring')}
                </label>
                <label className="space-y-1 text-[10px] uppercase tracking-widest text-slate-500 md:col-span-2">
                  {t('adminTournaments.description')}
                  <textarea
                    value={form.description}
                    onChange={(e) => field('description', e.target.value)}
                    rows={2}
                    className="input-admin w-full"
                  />
                </label>
                <label className="space-y-1 text-[10px] uppercase tracking-widest text-slate-500">
                  {t('adminTournaments.type')}
                  <select
                    value={form.type}
                    onChange={(e) => field('type', e.target.value as TournamentType)}
                    className="input-admin w-full"
                  >
                    {TOURNAMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-[10px] uppercase tracking-widest text-slate-500">
                  {t('adminTournaments.metric')}
                  <select
                    value={form.metric}
                    onChange={(e) => field('metric', e.target.value as TournamentMetric)}
                    className="input-admin w-full"
                  >
                    {TOURNAMENT_METRICS.map((metric) => (
                      <option key={metric} value={metric}>
                        {metric}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-[10px] uppercase tracking-widest text-slate-500">
                  {t('adminTournaments.starts')}
                  <input
                    required
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) => field('startsAt', e.target.value)}
                    className="input-admin w-full"
                  />
                </label>
                <label className="space-y-1 text-[10px] uppercase tracking-widest text-slate-500">
                  {t('adminTournaments.ends')}
                  <input
                    required
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(e) => field('endsAt', e.target.value)}
                    className="input-admin w-full"
                  />
                </label>
                {form.type !== 'CUSTOM' ? (
                  <p className="text-[11px] leading-snug text-slate-500 md:col-span-2">
                    {t('adminTournaments.window_snap_hint')}
                  </p>
                ) : null}
                <div className="md:col-span-2">
                  <TournamentPrizeEditor prizes={form.prizes} onChange={(prizes) => field('prizes', prizes)} />
                </div>
              </div>
            </div>
            <div className="flex shrink-0 gap-2 border-t border-slate-800 px-5 py-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50"
              >
                {saving ? t('adminManaged.saving') : editId ? t('adminManaged.update') : t('adminManaged.create')}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setShowForm(false);
                  setEditId(null);
                }}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 disabled:opacity-50"
              >
                {t('adminTournaments.close')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Filters + list */}
      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
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
              className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                tab === id
                  ? 'bg-amber-500 text-slate-950'
                  : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('adminTournaments.search_placeholder')}
            className="input-admin"
          />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-admin">
            <option value="">{t('adminTournaments.filter_all_types')}</option>
            {TOURNAMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select value={filterMetric} onChange={(e) => setFilterMetric(e.target.value)} className="input-admin">
            <option value="">{t('adminTournaments.filter_all_metrics')}</option>
            {TOURNAMENT_METRICS.map((metric) => (
              <option key={metric} value={metric}>
                {metric}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 py-16 text-center">
            <XCircle className="mb-2 h-8 w-8 text-slate-700" />
            <p className="text-sm text-slate-500">{t('adminManaged.empty')}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/30 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="p-4">ID</th>
                  <th>{t('adminTournaments.name')}</th>
                  <th>{t('adminTournaments.type')}</th>
                  <th>{t('adminTournaments.metric')}</th>
                  <th>{t('adminTournaments.status')}</th>
                  <th className="p-4 text-right">{t('adminManaged.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map((row) => {
                  const editable = row.status === 'ACTIVE' || row.status === 'SCHEDULED';
                  return (
                    <tr key={row.id} className="hover:bg-slate-800/20">
                      <td className="p-4 font-mono text-amber-300/80">{row.id}</td>
                      <td className="max-w-[220px]">
                        <p className="truncate font-semibold text-white">{row.name}</p>
                        {row.recurring ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500/80">
                            {t('adminTournaments.recurring')}
                          </span>
                        ) : null}
                      </td>
                      <td className="font-mono text-xs text-slate-400">{row.type}</td>
                      <td className="font-mono text-xs text-slate-400">{row.metric}</td>
                      <td className={`text-xs font-bold ${STATUS_CLASS[row.status]}`}>{row.status}</td>
                      <td className="p-4">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <IconBtn label={t('adminTournaments.inspect')} onClick={() => setInspect(row)}>
                            <Eye className="h-3.5 w-3.5" />
                          </IconBtn>
                          {editable ? (
                            <>
                              <IconBtn label={t('adminManaged.update')} onClick={() => openEdit(row)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </IconBtn>
                              <button
                                type="button"
                                onClick={() => void quickAction(row, 'finalize')}
                                className="rounded-lg border border-amber-500/30 px-2 py-1 text-[10px] font-bold text-amber-300"
                              >
                                {t('adminTournaments.finalize')}
                              </button>
                              <button
                                type="button"
                                onClick={() => void quickAction(row, 'cancel')}
                                className="rounded-lg border border-red-500/30 px-2 py-1 text-[10px] font-bold text-red-300"
                              >
                                {t('adminTournaments.cancel')}
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

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

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-black ${accent}`}>{value}</p>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded-lg border border-slate-700 p-1.5 text-slate-300 hover:bg-slate-800"
    >
      {children}
    </button>
  );
}
