import { Gift, Loader2, Plus, Trash2, WandSparkles } from 'lucide-react';
import { summarizeRewardRow } from '../adminMiniPassForm';
import {
  FieldLabel,
  INPUT_MT,
  REWARD_KINDS,
  RewardMinerPicker,
  SectionCard,
} from '../adminMiniPassSeason.parts';
import type { AdminMiniPassSeasonState } from '../useAdminMiniPassSeason';

export function MiniPassRewardsSection({ s }: { s: AdminMiniPassSeasonState }) {
  const {
    t,
    templateBusy,
    rewardCatalogQuery,
    setRewardCatalogQuery,
    rewardCatalogLoading,
    selectedShopMiner,
    setSelectedShopMiner,
    selectedEventMiner,
    setSelectedEventMiner,
    rewardDraft,
    setRewardDraft,
    rewardCoverage,
    rewardDraftCheck,
    rewardCatalogOptions,
    addReward,
    deleteReward,
    applyQuickRewardTemplate,
    sortedRewards,
  } = s;

  return (
    <SectionCard
      icon={Gift}
      title={t('adminMiniPass.sections.rewards')}
      description={t('adminMiniPass.sections.rewards_desc')}
      variant="accent"
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void applyQuickRewardTemplate()}
          disabled={templateBusy}
          className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-slate-800 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-amber-200 hover:bg-slate-700 disabled:opacity-50"
        >
          {templateBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <WandSparkles className="h-4 w-4" />
          )}
          {t('adminMiniPass.season.quick_template')}
        </button>
        <p className="max-w-md text-[11px] text-slate-500">{t('adminMiniPass.season.quick_template_hint')}</p>
      </div>

      {rewardCoverage.missingLevels.length > 0 ? (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/90">
          {t('adminMiniPass.warnings.missing_reward_levels', {
            count: rewardCoverage.missingLevels.length,
          })}
        </div>
      ) : null}

      <div className="space-y-8 rounded-2xl border border-slate-800 bg-slate-950/40 p-5 md:p-6">
        <header className="space-y-1">
          <h3 className="text-sm font-bold text-white">{t('adminMiniPass.rewards.add_title')}</h3>
          <p className="max-w-3xl text-xs leading-relaxed text-slate-500">
            {t('adminMiniPass.rewards.form_help')}
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <FieldLabel
              htmlFor="mp-rwd-level"
              label={t('adminMiniPass.rewards.level')}
              hint={t('adminMiniPass.rewards.level_hint')}
            />
            <input
              id="mp-rwd-level"
              type="number"
              min={1}
              max={500}
              className={INPUT_MT}
              value={rewardDraft.level}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setRewardDraft({
                  ...rewardDraft,
                  level: Number.isFinite(n) ? Math.max(1, Math.min(500, n)) : rewardDraft.level,
                });
              }}
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="mp-rwd-kind"
              label={t('adminMiniPass.rewards.kind')}
              hint={t('adminMiniPass.rewards.kind_hint_short')}
            />
            <select
              id="mp-rwd-kind"
              className={INPUT_MT}
              value={rewardDraft.rewardKind}
              onChange={(e) => {
                const kind = e.target.value;
                setRewardDraft((prev) => ({
                  ...prev,
                  rewardKind: kind,
                  minerId: kind === 'SHOP_MINER' ? prev.minerId : '',
                  eventMinerId: kind === 'EVENT_MINER' ? prev.eventMinerId : '',
                }));
                setRewardCatalogQuery('');
              }}
            >
              {REWARD_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`adminMiniPass.reward_kinds.${kind}`)}
                </option>
              ))}
            </select>
            <p className="mt-3 border-l-2 border-amber-500/35 pl-3 text-xs leading-snug text-slate-400">
              {t(`adminMiniPass.reward_kind_hints.${rewardDraft.rewardKind}`)}
            </p>
          </div>
        </div>

        {rewardDraft.rewardKind !== 'NONE' ? (
          <div className="space-y-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 md:p-5">
            <p className="text-xs font-black uppercase tracking-wider text-amber-300/95">
              {t('adminMiniPass.rewards.payload_heading')}
            </p>
            {(rewardDraft.rewardKind === 'SHOP_MINER' || rewardDraft.rewardKind === 'EVENT_MINER') && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {rewardDraft.rewardKind === 'SHOP_MINER' ? (
                  <RewardMinerPicker
                    id="mp-rwd-shop-miner"
                    label={t('adminMiniPass.rewards.shop_miner_id')}
                    hint={t('adminMiniPass.rewards.shop_miner_hint')}
                    query={rewardCatalogQuery}
                    onQueryChange={setRewardCatalogQuery}
                    options={rewardCatalogOptions}
                    selected={selectedShopMiner}
                    loading={rewardCatalogLoading}
                    t={t}
                    onSelect={(item) => {
                      setSelectedShopMiner(item);
                      setRewardCatalogQuery(item.name);
                      setRewardDraft((prev) => ({ ...prev, minerId: String(item.numericId) }));
                    }}
                  />
                ) : (
                  <RewardMinerPicker
                    id="mp-rwd-event-miner"
                    label={t('adminMiniPass.rewards.event_miner_id')}
                    hint={t('adminMiniPass.rewards.event_miner_hint')}
                    query={rewardCatalogQuery}
                    onQueryChange={setRewardCatalogQuery}
                    options={rewardCatalogOptions}
                    selected={selectedEventMiner}
                    loading={rewardCatalogLoading}
                    t={t}
                    onSelect={(item) => {
                      setSelectedEventMiner(item);
                      setRewardCatalogQuery(item.name);
                      setRewardDraft((prev) => ({ ...prev, eventMinerId: String(item.numericId) }));
                    }}
                  />
                )}
              </div>
            )}
            {rewardDraft.rewardKind === 'HASHRATE_TEMP' ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <FieldLabel
                    htmlFor="mp-rwd-hr"
                    label={t('adminMiniPass.rewards.hash_rate')}
                    hint={t('adminMiniPass.rewards.hash_rate_hint')}
                  />
                  <input
                    id="mp-rwd-hr"
                    className={INPUT_MT}
                    value={rewardDraft.hashRate}
                    onChange={(e) => setRewardDraft({ ...rewardDraft, hashRate: e.target.value })}
                    placeholder="25"
                  />
                </div>
                <div>
                  <FieldLabel
                    htmlFor="mp-rwd-hr-days"
                    label={t('adminMiniPass.rewards.hash_days')}
                    hint={t('adminMiniPass.rewards.hash_days_hint')}
                  />
                  <input
                    id="mp-rwd-hr-days"
                    className={INPUT_MT}
                    value={rewardDraft.hashRateDays}
                    onChange={(e) => setRewardDraft({ ...rewardDraft, hashRateDays: e.target.value })}
                    placeholder="7"
                  />
                </div>
              </div>
            ) : null}
            {rewardDraft.rewardKind === 'BLK' || rewardDraft.rewardKind === 'POL' ? (
              <div>
                <FieldLabel
                  htmlFor="mp-rwd-token-amt"
                  label={
                    rewardDraft.rewardKind === 'BLK'
                      ? t('adminMiniPass.rewards.blk_amount')
                      : t('adminMiniPass.rewards.pol_amount')
                  }
                  hint={t('adminMiniPass.rewards.token_amount_hint')}
                />
                <input
                  id="mp-rwd-token-amt"
                  className={INPUT_MT}
                  value={rewardDraft.rewardKind === 'BLK' ? rewardDraft.blkAmount : rewardDraft.polAmount}
                  onChange={(e) =>
                    setRewardDraft({
                      ...rewardDraft,
                      ...(rewardDraft.rewardKind === 'BLK'
                        ? { blkAmount: e.target.value }
                        : { polAmount: e.target.value }),
                    })
                  }
                  placeholder="0.5"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3">
          <FieldLabel
            label={t('adminMiniPass.rewards.optional_titles')}
            hint={t('adminMiniPass.rewards.optional_titles_hint')}
          />
          <div className="grid grid-cols-1 gap-4">
            {(
              [
                { key: 'titleEn' as const, lab: t('adminMiniPass.locale.en'), id: 'mp-rwd-title-en' },
                { key: 'titlePtBR' as const, lab: t('adminMiniPass.locale.pt'), id: 'mp-rwd-title-pt' },
                { key: 'titleEs' as const, lab: t('adminMiniPass.locale.es'), id: 'mp-rwd-title-es' },
              ] as const
            ).map(({ key, lab, id }) => (
              <div key={key}>
                <label htmlFor={id} className="text-xs font-semibold text-slate-400">
                  {lab}
                </label>
                <input
                  id={id}
                  className={INPUT_MT}
                  placeholder={t('adminMiniPass.placeholders.reward_title_locale')}
                  value={rewardDraft[key]}
                  onChange={(e) => setRewardDraft({ ...rewardDraft, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>

        {!rewardDraftCheck.ok ? (
          <p className="text-xs text-amber-300/90">
            {t(`adminMiniPass.errors.${rewardDraftCheck.errorKey}`)}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void addReward()}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-950 hover:bg-amber-400"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          {t('adminMiniPass.rewards.add_button')}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('adminMiniPass.rewards.table_level')}</th>
              <th className="px-3 py-2">{t('adminMiniPass.rewards.table_kind')}</th>
              <th className="px-3 py-2">{t('adminMiniPass.rewards.table_amount')}</th>
              <th className="px-3 py-2 text-right">{t('adminMiniPass.rewards.table_actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {sortedRewards.map((row) => (
              <tr key={row.id} className="hover:bg-slate-800/20">
                <td className="px-3 py-2 font-mono font-bold text-amber-400/90">{row.level}</td>
                <td className="px-3 py-2 text-slate-300">
                  {t(`adminMiniPass.reward_kinds.${row.rewardKind}`)}
                </td>
                <td className="px-3 py-2 text-xs text-slate-400">{summarizeRewardRow(row)}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => void deleteReward(row.id)}
                    className="inline-flex rounded-lg p-2 text-red-400 hover:bg-red-500/10"
                    aria-label={t('adminMiniPass.delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sortedRewards.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">{t('adminMiniPass.rewards.empty')}</div>
        ) : null}
      </div>
    </SectionCard>
  );
}
