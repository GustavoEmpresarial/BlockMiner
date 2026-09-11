import { ArrowLeft, Info, Loader2 } from 'lucide-react';
import { PreviewPanel } from './adminMiniPassSeason.parts';
import { MiniPassDetailsSection } from './components/MiniPassDetailsSection';
import { MiniPassMissionsSection } from './components/MiniPassMissionsSection';
import { MiniPassProgressionSection } from './components/MiniPassProgressionSection';
import { MiniPassRewardsSection } from './components/MiniPassRewardsSection';
import { MiniPassSettingsSection } from './components/MiniPassSettingsSection';
import { useAdminMiniPassSeason } from './useAdminMiniPassSeason';

export default function AdminMiniPassSeasonPage() {
  const s = useAdminMiniPassSeason();
  const {
    t,
    navigate,
    isNew,
    loading,
    saving,
    seasonId,
    form,
    setForm,
    rewards,
    missions,
    progressionRows,
    saveSeason,
  } = s;

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-amber-500" aria-hidden />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16">
      <button
        type="button"
        onClick={() => navigate('/admin/mini-pass')}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        {t('adminMiniPass.season.back')}
      </button>

      <div className="flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden />
        <p className="text-xs leading-relaxed text-amber-100/90">{t('adminMiniPass.workflow_hint')}</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          <form onSubmit={(e) => void saveSeason(e)} className="space-y-8">
            <MiniPassDetailsSection form={form} isNew={isNew} setForm={setForm} t={t} />
            <MiniPassProgressionSection
              form={form}
              progressionRows={progressionRows}
              setForm={setForm}
              t={t}
            />
            <MiniPassSettingsSection form={form} saving={saving} setForm={setForm} t={t} />
          </form>
          {!isNew && seasonId ? (
            <>
              <MiniPassRewardsSection s={s} />
              <MiniPassMissionsSection s={s} />
            </>
          ) : null}
        </div>
        <PreviewPanel form={form} rewards={rewards} missions={missions} t={t} />
      </div>
    </div>
  );
}
