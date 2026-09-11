import type { Dispatch, SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import { LayoutList } from 'lucide-react';
import type { ProgressionTier } from '../adminMiniPassForm';
import { FieldLabel, SectionCard, type SeasonFormState } from '../adminMiniPassSeason.parts';

type Props = {
  form: SeasonFormState;
  progressionRows: ProgressionTier[];
  setForm: Dispatch<SetStateAction<SeasonFormState>>;
  t: TFunction;
};

export function MiniPassProgressionSection({ form, progressionRows, setForm, t }: Props) {
  return (
    <SectionCard
      icon={LayoutList}
      title={t('adminMiniPass.sections.progression')}
      description={t('adminMiniPass.sections.progression_desc')}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel
            htmlFor="mp-max"
            label={t('adminMiniPass.fields.max_level')}
            hint={t('adminMiniPass.fields.max_level_hint')}
          />
          <input
            id="mp-max"
            type="number"
            min={1}
            max={500}
            className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white"
            value={form.maxLevel}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setForm({
                ...form,
                maxLevel: Number.isFinite(n) ? Math.max(1, Math.min(500, n)) : form.maxLevel,
              });
            }}
          />
        </div>
        <div>
          <FieldLabel
            htmlFor="mp-xp"
            label={t('adminMiniPass.fields.xp_per_level')}
            hint={t('adminMiniPass.fields.xp_per_level_hint')}
          />
          <input
            id="mp-xp"
            type="number"
            min={1}
            max={1_000_000}
            className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white"
            value={form.xpPerLevel}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setForm({
                ...form,
                xpPerLevel: Number.isFinite(n) ? Math.max(1, Math.min(1_000_000, n)) : form.xpPerLevel,
              });
            }}
          />
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          {t('adminMiniPass.progression.table_title')}
        </p>
        <div className="max-h-64 overflow-x-auto overflow-y-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[320px] text-left text-xs">
            <thead className="sticky top-0 bg-slate-950 uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">{t('adminMiniPass.progression.col_level')}</th>
                <th className="px-3 py-2">{t('adminMiniPass.progression.col_min_xp')}</th>
                <th className="px-3 py-2">{t('adminMiniPass.progression.col_xp_to_next')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {progressionRows.slice(0, 40).map((row) => (
                <tr key={row.level} className="hover:bg-slate-800/30">
                  <td className="px-3 py-2 font-mono font-bold text-amber-400/90">{row.level}</td>
                  <td className="px-3 py-2 font-mono">{row.minTotalXp}</td>
                  <td className="px-3 py-2 font-mono text-sky-400/80">{row.xpToAdvance || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {progressionRows.length > 40 ? (
          <p className="mt-2 text-[11px] text-slate-600">
            {t('adminMiniPass.progression.truncated', { shown: 40, total: progressionRows.length })}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}
