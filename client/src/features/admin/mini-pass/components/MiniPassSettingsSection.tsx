import type { Dispatch, SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import { Save, Settings2 } from 'lucide-react';
import { FieldLabel, SectionCard, type SeasonFormState } from '../adminMiniPassSeason.parts';

type Props = {
  form: SeasonFormState;
  saving: boolean;
  setForm: Dispatch<SetStateAction<SeasonFormState>>;
  t: TFunction;
};

export function MiniPassSettingsSection({ form, saving, setForm, t }: Props) {
  return (
    <SectionCard
      icon={Settings2}
      title={t('adminMiniPass.sections.settings')}
      description={t('adminMiniPass.sections.settings_desc')}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel
            htmlFor="mp-buy"
            label={t('adminMiniPass.fields.buy_level_pol')}
            hint={t('adminMiniPass.fields.buy_level_hint')}
          />
          <input
            id="mp-buy"
            className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white"
            value={form.buyLevelPricePol}
            onChange={(e) => setForm({ ...form, buyLevelPricePol: e.target.value })}
            placeholder="0"
          />
        </div>
        <div>
          <FieldLabel
            htmlFor="mp-complete"
            label={t('adminMiniPass.fields.complete_pass_pol')}
            hint={t('adminMiniPass.fields.complete_pass_hint')}
          />
          <input
            id="mp-complete"
            className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white"
            value={form.completePassPricePol}
            onChange={(e) => setForm({ ...form, completePassPricePol: e.target.value })}
            placeholder="0"
          />
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-600 text-amber-500 focus:ring-amber-500"
          checked={form.isActive}
          onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
        />
        <div>
          <span className="text-sm font-bold text-white">{t('adminMiniPass.fields.is_active')}</span>
          <p className="text-[11px] text-slate-500">{t('adminMiniPass.fields.is_active_hint')}</p>
        </div>
      </label>
      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-amber-400 disabled:opacity-50"
      >
        <Save className="h-4 w-4 shrink-0" aria-hidden />
        {t(saving ? 'adminMiniPass.season.saving' : 'adminMiniPass.season.save')}
      </button>
    </SectionCard>
  );
}
