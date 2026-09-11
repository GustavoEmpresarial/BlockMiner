import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock3, Lock, Sliders, X } from 'lucide-react';
import { DASHBOARD_COIN_LOGO } from '../lib/dashboardCoinLogos';
type Props = {
  effectivePolPercent: number;
  effectiveShibPercent: number;
  blockRewardPol: number;
  blockRewardShib: number;
  savingAlloc: boolean;
  allocModalOpen: boolean;
  draftPol: string;
  draftShib: string;
  draftError: string | null;
  onOpenModal: () => void;
  onCloseModal: () => void;
  onDraftPolChange: (raw: string) => void;
  onDraftShibChange: (raw: string) => void;
  onPreset: (pol: number) => void;
  onSave: () => void;
};

function CoinMark({
  symbol,
  logoUrl,
  tone,
}: {
  symbol: string;
  logoUrl?: string | null;
  tone: 'pol' | 'shib' | 'blk';
}) {
  const toneClass =
    tone === 'pol'
      ? 'bg-indigo-500/20 border-indigo-500/40'
      : tone === 'shib'
        ? 'bg-amber-500/20 border-amber-500/40'
        : 'bg-cyan-500/15 border-cyan-500/30';

  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border shrink-0 ${toneClass}`}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-5 w-5 rounded-full object-contain" />
      ) : (
        <span className="text-[11px] font-black text-cyan-300">{symbol.slice(0, 1)}</span>
      )}
    </span>
  );
}

export function MiningAllocationPanel({
  effectivePolPercent,
  effectiveShibPercent,
  blockRewardPol,
  blockRewardShib,
  savingAlloc,
  allocModalOpen,
  draftPol,
  draftShib,
  draftError,
  onOpenModal,
  onCloseModal,
  onDraftPolChange,
  onDraftShibChange,
  onPreset,
  onSave,
}: Props): ReactElement {
  const { t } = useTranslation();
  const blkSoon = 0;
  const draftPolN = Number(draftPol);
  const draftShibN = Number(draftShib);
  const draftPolSafe = Number.isFinite(draftPolN) ? draftPolN : 0;
  const draftShibSafe = Number.isFinite(draftShibN) ? draftShibN : 0;

  return (
    <>
      <div className="bg-surface border border-gray-800/50 rounded-2xl p-6 md:p-8 shadow-lg overflow-hidden relative">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.08),transparent_55%)]" />

        <div className="relative flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                {t('dashboard.mining_allocation_title')}
              </h3>
              <p className="text-[11px] text-gray-500 mt-1.5 max-w-xl leading-relaxed">
                {t('dashboard.mining_allocation_description')}
              </p>
            </div>
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest self-start sm:self-auto">
              {savingAlloc
                ? t('dashboard.mining_allocation_saving')
                : t('dashboard.mining_allocation_applies_next_block')}
            </span>
          </div>

          {/* Stacked power bar */}
          <div className="space-y-2">
            <div className="h-3 rounded-full overflow-hidden flex bg-slate-900 border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all duration-500"
                style={{ width: `${effectivePolPercent}%` }}
              />
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-500"
                style={{ width: `${effectiveShibPercent}%` }}
              />
              <div
                className="h-full bg-cyan-500/20 border-l border-dashed border-cyan-500/30"
                style={{ width: `${Math.max(blkSoon, 0)}%`, minWidth: blkSoon === 0 ? 0 : undefined }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-indigo-600/15 border border-indigo-500/35 text-indigo-200">
                <CoinMark symbol="POL" logoUrl={DASHBOARD_COIN_LOGO.POL} tone="pol" />
                {effectivePolPercent}% {t('dashboard.mining_allocation_pol_label')}
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-amber-600/15 border border-amber-500/35 text-amber-200">
                <CoinMark symbol="SHIB" logoUrl={DASHBOARD_COIN_LOGO.SHIB} tone="shib" />
                {effectiveShibPercent}% {t('dashboard.mining_allocation_shib_label')}
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-cyan-500/10 border border-cyan-500/25 text-cyan-200/80 opacity-80">
                <CoinMark symbol="BLK" logoUrl={DASHBOARD_COIN_LOGO.BLK} tone="blk" />
                0% {t('dashboard.mining_allocation_blk_label')}
                <span className="ml-0.5 rounded-md bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-cyan-300">
                  {t('dashboard.mining_allocation_blk_soon')}
                </span>
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1 text-[11px] font-medium">
              <div className="flex items-center justify-between bg-indigo-500/5 border border-indigo-500/15 rounded-xl px-4 py-2.5">
                <span className="text-gray-500 uppercase tracking-widest text-[9px] font-black">
                  {t('dashboard.mining_allocation_estimated_pol')}
                </span>
                <span className="text-indigo-300 font-black tabular-nums">
                  {(blockRewardPol * (effectivePolPercent / 100)).toFixed(4)} POL
                </span>
              </div>
              <div className="flex items-center justify-between bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-2.5">
                <span className="text-gray-500 uppercase tracking-widest text-[9px] font-black">
                  {t('dashboard.mining_allocation_estimated_shib')}
                </span>
                <span className="text-amber-300 font-black tabular-nums">
                  {(blockRewardShib * (effectiveShibPercent / 100)).toFixed(2)} SHIB
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenModal}
              disabled={savingAlloc}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/20 hover:border-indigo-400/50 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Sliders className="w-3.5 h-3.5" />
              {t('dashboard.mining_allocation_edit_split')}
            </button>
          </div>
        </div>
      </div>

      {allocModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => {
            if (!savingAlloc) onCloseModal();
          }}
        >
          <div
            className="bg-surface border border-gray-800/80 rounded-2xl shadow-2xl w-full max-w-lg p-6 relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-indigo-500/10 to-transparent" />

            <button
              type="button"
              onClick={onCloseModal}
              disabled={savingAlloc}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition disabled:opacity-50 z-10"
              aria-label={t('common.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative mb-6 pr-8">
              <h3 className="text-base font-black text-white uppercase tracking-widest flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                {t('dashboard.mining_allocation_modal_title')}
              </h3>
              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                {t('dashboard.mining_allocation_modal_description')}
              </p>
            </div>

            {/* Live draft bar */}
            <div className="mb-5 h-2.5 rounded-full overflow-hidden flex bg-slate-900 border border-slate-800">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{ width: `${draftPolSafe}%` }}
              />
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${draftShibSafe}%` }}
              />
            </div>

            <div className="space-y-3 mb-5">
              {/* POL */}
              <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <CoinMark symbol="POL" logoUrl={DASHBOARD_COIN_LOGO.POL} tone="pol" />
                    <span className="text-sm font-black text-indigo-200 uppercase tracking-widest">
                      {t('dashboard.mining_allocation_pol_label')}
                    </span>
                  </div>
                  <div className="relative w-28">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      inputMode="numeric"
                      value={draftPol}
                      onChange={(e) => onDraftPolChange(e.target.value)}
                      disabled={savingAlloc}
                      className="w-full bg-gray-950/80 border border-indigo-500/35 rounded-xl px-3 py-2 pr-8 text-white font-black text-base tabular-nums focus:outline-none focus:border-indigo-400 disabled:opacity-50"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-300 font-black text-xs">
                      %
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={draftPolSafe}
                  disabled={savingAlloc}
                  onChange={(e) => onDraftPolChange(e.target.value)}
                  className="w-full accent-indigo-500"
                />
              </div>

              {/* SHIB */}
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <CoinMark symbol="SHIB" logoUrl={DASHBOARD_COIN_LOGO.SHIB} tone="shib" />
                    <span className="text-sm font-black text-amber-200 uppercase tracking-widest">
                      {t('dashboard.mining_allocation_shib_label')}
                    </span>
                  </div>
                  <div className="relative w-28">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      inputMode="numeric"
                      value={draftShib}
                      onChange={(e) => onDraftShibChange(e.target.value)}
                      disabled={savingAlloc}
                      className="w-full bg-gray-950/80 border border-amber-500/35 rounded-xl px-3 py-2 pr-8 text-white font-black text-base tabular-nums focus:outline-none focus:border-amber-400 disabled:opacity-50"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-300 font-black text-xs">
                      %
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={draftShibSafe}
                  disabled={savingAlloc}
                  onChange={(e) => onDraftShibChange(e.target.value)}
                  className="w-full accent-amber-500"
                />
              </div>

              {/* BLK — coming soon */}
              <div className="rounded-2xl border border-dashed border-cyan-500/30 bg-cyan-500/[0.04] p-4 opacity-90">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CoinMark symbol="BLK" logoUrl={DASHBOARD_COIN_LOGO.BLK} tone="blk" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-cyan-200/90 uppercase tracking-widest">
                          {t('dashboard.mining_allocation_blk_label')}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-cyan-500/15 border border-cyan-500/25 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-cyan-300">
                          <Clock3 className="w-3 h-3" />
                          {t('dashboard.mining_allocation_blk_soon')}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                        {t('dashboard.mining_allocation_blk_soon_hint')}
                      </p>
                    </div>
                  </div>
                  <div className="relative w-28 shrink-0">
                    <input
                      type="number"
                      value={0}
                      disabled
                      readOnly
                      aria-disabled
                      className="w-full bg-slate-950/60 border border-cyan-500/20 rounded-xl px-3 py-2 pr-8 text-cyan-200/50 font-black text-base tabular-nums cursor-not-allowed"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-cyan-400/40 font-black text-xs">
                      %
                    </span>
                    <Lock className="absolute -left-1 -top-1 w-3.5 h-3.5 text-cyan-400/60" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { pol: 0, label: '0/100' },
                { pol: 25, label: '25/75' },
                { pol: 50, label: '50/50' },
                { pol: 75, label: '75/25' },
                { pol: 100, label: '100/0' },
              ].map((preset) => {
                const active = draftPolSafe === preset.pol;
                return (
                  <button
                    key={preset.pol}
                    type="button"
                    disabled={savingAlloc}
                    onClick={() => onPreset(preset.pol)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition disabled:opacity-50 ${
                      active
                        ? 'bg-indigo-500/25 border-indigo-400/50 text-indigo-100'
                        : 'bg-gray-800/60 border-gray-700/60 text-gray-300 hover:bg-gray-700/60 hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {draftError && <p className="text-[11px] font-bold text-red-400 mb-3">{draftError}</p>}

            <p className="text-[10px] text-gray-500 mb-5">{t('dashboard.mining_allocation_modal_hint')}</p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCloseModal}
                disabled={savingAlloc}
                className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-white transition disabled:opacity-50"
              >
                {t('dashboard.mining_allocation_modal_cancel')}
              </button>
              <button
                type="button"
                disabled={savingAlloc}
                onClick={onSave}
                className="px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingAlloc
                  ? t('dashboard.mining_allocation_saving')
                  : t('dashboard.mining_allocation_modal_save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
