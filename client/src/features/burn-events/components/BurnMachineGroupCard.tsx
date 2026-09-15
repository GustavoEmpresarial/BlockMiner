import { useTranslation } from 'react-i18next';
import { Minus, Plus, Zap } from 'lucide-react';
import { burnableLocationI18nKey, type BurnMachineGroup } from '../lib/burnGroup.helpers';
import { MachineImage } from '../../machines/components/MachineImage';

interface BurnMachineGroupCardProps {
  group: BurnMachineGroup;
  /** True when Max already filled enough H/s for the burn requirement. */
  isFilledToRequirement?: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onToggleMax: () => void;
}

function resolveAssetUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const u = url.trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (typeof window !== 'undefined' && u.startsWith('/')) return `${window.location.origin}${u}`;
  return u;
}

function formatHashRate(v: number): string {
  return `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} H/s`;
}

function locationLabel(
  location: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  return t(burnableLocationI18nKey(location), { defaultValue: location });
}

export function BurnMachineGroupCard({
  group,
  isFilledToRequirement = false,
  onAdd,
  onRemove,
  onToggleMax,
}: BurnMachineGroupCardProps) {
  const { t } = useTranslation();
  const isSelected = group.selectedCount > 0;
  const isFullySelected = group.selectedCount === group.availableCount;
  const showClearMax = isFilledToRequirement || isFullySelected;
  const img = resolveAssetUrl(group.imageUrl);

  return (
    <div
      className={`relative flex flex-col justify-between gap-3 rounded-2xl border p-3.5 transition-all duration-200 sm:flex-row sm:items-center ${
        isSelected
          ? 'border-orange-500/35 bg-gradient-to-r from-orange-500/15 via-slate-900/90 to-slate-950 shadow-md shadow-orange-500/10 ring-1 ring-orange-500/30'
          : 'border-white/10 bg-slate-950/60 hover:border-white/20 hover:bg-slate-900/70'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative flex h-14 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-orange-500/15 bg-gradient-to-b from-slate-800 to-slate-950 p-1">
          {img ? (
            <MachineImage
              imageUrl={img}
              name={group.minerName}
              className="relative max-h-full max-w-full object-contain drop-shadow-md"
            />
          ) : (
            <Zap className="h-5 w-5 text-orange-400/60" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-black text-white">{group.minerName}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                group.location === 'WAREHOUSE'
                  ? 'border border-sky-500/30 bg-sky-500/10 text-sky-300'
                  : 'border border-slate-700 bg-slate-800 text-slate-300'
              }`}
            >
              {locationLabel(group.location, t)}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-orange-400">
              {formatHashRate(group.hashRate)}{' '}
              <span className="text-[10px] font-medium text-slate-400">/ un</span>
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400">
              {group.availableCount} {t('burnEvents.available_unit', { defaultValue: 'disponíveis' })}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-2 sm:border-t-0 sm:pt-0">
        {isSelected && (
          <div className="text-right sm:mr-2">
            <span className="text-[10px] uppercase font-bold text-slate-400">Total: </span>
            <span className="text-xs font-black text-emerald-400">
              {formatHashRate(group.selectedCount * group.hashRate)}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5 bg-slate-900/90 rounded-xl border border-white/10 p-1">
          <button
            type="button"
            aria-label={t('common.decrease', { defaultValue: 'Diminuir' })}
            disabled={group.selectedCount <= 0}
            onClick={onRemove}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>

          <span className="min-w-[3rem] text-center font-mono text-xs font-black text-white">
            {group.selectedCount} / {group.availableCount}
          </span>

          <button
            type="button"
            aria-label={t('common.increase', { defaultValue: 'Aumentar' })}
            disabled={isFullySelected}
            onClick={onAdd}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleMax}
          className={`rounded-xl border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${
            showClearMax
              ? 'border-orange-500/40 bg-orange-500/20 text-orange-300 hover:bg-orange-500/30'
              : 'border-white/10 bg-slate-900/60 text-slate-400 hover:border-white/20 hover:text-white'
          }`}
        >
          {showClearMax ? 'Limpar' : 'Max'}
        </button>
      </div>
    </div>
  );
}
