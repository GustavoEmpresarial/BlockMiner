import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { tournamentsAdminApi } from '../tournaments.admin.api';
import {
  emptyPrizeDraft,
  PRIZE_TYPES,
  type CatalogMiner,
  type PrizeDraft,
  type PrizeType,
} from '../tournaments.admin.types';

function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (typeof window !== 'undefined' && u.startsWith('/')) return `${window.location.origin}${u}`;
  return u;
}

function MinerSearchField({
  prize,
  onSelect,
  onClear,
}: {
  prize: PrizeDraft;
  onSelect: (m: CatalogMiner) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogMiner[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const search = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const { data } = await tournamentsAdminApi.searchMiners(q.trim());
          setResults(data.ok ? data.miners ?? [] : []);
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 300);
  };

  const img = resolveAssetUrl(prize.minerImageUrl);

  return (
    <div className="space-y-2 sm:col-span-2">
      {prize.minerId ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
          {img ? (
            <img src={img} alt="" className="h-10 w-10 rounded-lg border border-slate-700 object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-lg border border-slate-700 bg-slate-900" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-emerald-200">{prize.minerName || `#${prize.minerId}`}</p>
            <p className="text-[11px] text-emerald-100/70">ID {prize.minerId}</p>
          </div>
          <button type="button" onClick={onClear} className="text-slate-400 hover:text-white" aria-label={t('adminTournaments.clear_miner')}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder={t('adminTournaments.reward_search_placeholder')}
            className="input-admin w-full pl-9"
          />
        </div>
      )}
      {!prize.minerId && (loading || results.length > 0 || query.trim()) && (
        <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('adminTournaments.searching_miners')}
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-500">{t('adminTournaments.no_miners')}</p>
          ) : (
            results.map((m) => {
              const mImg = resolveAssetUrl(m.imageUrl);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onSelect(m);
                    setQuery('');
                    setResults([]);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-800/70"
                >
                  {mImg ? (
                    <img src={mImg} alt="" className="h-9 w-9 rounded-lg border border-slate-700 object-cover" />
                  ) : (
                    <div className="h-9 w-9 rounded-lg border border-slate-700 bg-slate-900" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{m.name}</p>
                    <p className="text-[11px] text-slate-400">
                      #{m.id}
                      {m.baseHashRate != null ? ` · ${m.baseHashRate} H/s` : ''}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function TournamentPrizeEditor({
  prizes,
  onChange,
}: {
  prizes: PrizeDraft[];
  onChange: (next: PrizeDraft[]) => void;
}) {
  const { t } = useTranslation();

  const update = (key: string, patch: Partial<PrizeDraft>) => {
    onChange(prizes.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  };

  const remove = (key: string) => {
    onChange(prizes.filter((p) => p.key !== key));
  };

  const add = () => {
    const last = prizes[prizes.length - 1];
    const nextFrom = last ? last.rankTo + 1 : 1;
    onChange([...prizes, emptyPrizeDraft(nextFrom, nextFrom)]);
  };

  return (
    <div className="space-y-3 sm:col-span-full">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('adminTournaments.prizes')}</p>
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 px-2 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/10"
        >
          <Plus className="h-3 w-3" />
          {t('adminTournaments.add_prize')}
        </button>
      </div>

      {prizes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-800 px-4 py-6 text-center text-xs text-slate-500">
          {t('adminTournaments.prizes_empty')}
        </p>
      ) : (
        <div className="space-y-3">
          {prizes.map((p, idx) => (
            <div key={p.key} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] text-slate-500">#{idx + 1}</span>
                <button type="button" onClick={() => remove(p.key)} className="text-red-300/80 hover:text-red-300" aria-label={t('adminTournaments.remove_prize')}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1 text-[10px] uppercase tracking-widest text-slate-500">
                  {t('adminTournaments.rank_from')}
                  <input
                    type="number"
                    min={1}
                    required
                    value={p.rankFrom}
                    onChange={(e) => update(p.key, { rankFrom: Number(e.target.value) || 1 })}
                    className="input-admin w-full"
                  />
                </label>
                <label className="space-y-1 text-[10px] uppercase tracking-widest text-slate-500">
                  {t('adminTournaments.rank_to')}
                  <input
                    type="number"
                    min={1}
                    required
                    value={p.rankTo}
                    onChange={(e) => update(p.key, { rankTo: Number(e.target.value) || 1 })}
                    className="input-admin w-full"
                  />
                </label>
                <label className="space-y-1 text-[10px] uppercase tracking-widest text-slate-500 sm:col-span-2">
                  {t('adminTournaments.prize_type')}
                  <select
                    value={p.prizeType}
                    onChange={(e) => update(p.key, { prizeType: e.target.value as PrizeType })}
                    className="input-admin w-full"
                  >
                    {PRIZE_TYPES.map((pt) => (
                      <option key={pt} value={pt}>
                        {t(`adminTournaments.prize_type_${pt}`)}
                      </option>
                    ))}
                  </select>
                </label>

                {p.prizeType === 'POL' && (
                  <label className="space-y-1 text-[10px] uppercase tracking-widest text-slate-500 sm:col-span-2">
                    {t('adminTournaments.pol_amount')}
                    <input
                      type="number"
                      min={0}
                      step="any"
                      required
                      value={p.polAmount}
                      onChange={(e) => update(p.key, { polAmount: e.target.value })}
                      className="input-admin w-full"
                    />
                  </label>
                )}
                {p.prizeType === 'BLK' && (
                  <label className="space-y-1 text-[10px] uppercase tracking-widest text-slate-500 sm:col-span-2">
                    {t('adminTournaments.blk_amount')}
                    <input
                      type="number"
                      min={0}
                      step="any"
                      required
                      value={p.blkAmount}
                      onChange={(e) => update(p.key, { blkAmount: e.target.value })}
                      className="input-admin w-full"
                    />
                  </label>
                )}
                {p.prizeType === 'MINING_BOOST' && (
                  <>
                    <label className="space-y-1 text-[10px] uppercase tracking-widest text-slate-500">
                      {t('adminTournaments.boost_hashrate')}
                      <input
                        type="number"
                        min={0}
                        step="any"
                        required
                        value={p.boostHashRate}
                        onChange={(e) => update(p.key, { boostHashRate: e.target.value })}
                        className="input-admin w-full"
                      />
                    </label>
                    <label className="space-y-1 text-[10px] uppercase tracking-widest text-slate-500">
                      {t('adminTournaments.boost_hours')}
                      <input
                        type="number"
                        min={1}
                        required
                        value={p.boostHours}
                        onChange={(e) => update(p.key, { boostHours: e.target.value })}
                        className="input-admin w-full"
                      />
                    </label>
                  </>
                )}
                {p.prizeType === 'MACHINE' && (
                  <>
                    <MinerSearchField
                      prize={p}
                      onSelect={(m) =>
                        update(p.key, {
                          minerId: m.id,
                          minerName: m.name,
                          minerImageUrl: m.imageUrl ?? null,
                        })
                      }
                      onClear={() => update(p.key, { minerId: null, minerName: '', minerImageUrl: null })}
                    />
                    <label className="space-y-1 text-[10px] uppercase tracking-widest text-slate-500">
                      {t('adminTournaments.miner_count')}
                      <input
                        type="number"
                        min={1}
                        required
                        value={p.minerCount}
                        onChange={(e) => update(p.key, { minerCount: e.target.value })}
                        className="input-admin w-full"
                      />
                    </label>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TournamentPrizeEditor;
