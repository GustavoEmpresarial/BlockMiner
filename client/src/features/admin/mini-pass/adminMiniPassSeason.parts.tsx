import { useMemo, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { Eye, Loader2, type LucideIcon } from "lucide-react";
import type { AdminMiniPassLevelRewardRow, AdminMiniPassMissionRow, AdminMinerCatalogRow } from '../lib/admin.types';
import { buildProgressionTiers, summarizeRewardRow } from "./adminMiniPassForm";

export const REWARD_KINDS = ["NONE", "SHOP_MINER", "EVENT_MINER", "HASHRATE_TEMP", "BLK", "POL"];
export const CADENCES = ["EVENT", "DAILY", "WEEKLY"];
export const MISSION_TYPES = [
  "PLAY_GAMES",
  "MINE_BLK",
  "LOGIN_DAY",
  "WATCH_YOUTUBE",
  "AUTO_MINING_TURBO",
  "INTERNAL_OFFERWALL",
];

export const INPUT_BASE =
  "w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40";
export const INPUT_MT = `mt-2 ${INPUT_BASE}`;
export const TEXTAREA_MT = `mt-2 ${INPUT_BASE} resize-y min-h-[76px]`;

export type SeasonFormState = {
  slug: string;
  titleEn: string;
  titlePtBR: string;
  titleEs: string;
  subtitleEn: string;
  subtitlePtBR: string;
  subtitleEs: string;
  startsAt: string;
  endsAt: string;
  maxLevel: number;
  xpPerLevel: number;
  buyLevelPricePol: string;
  completePassPricePol: string;
  bannerImageUrl: string;
  isActive: boolean;
};

export type RewardCatalogKind = "SHOP_MINER" | "EVENT_MINER";

export type RewardCatalogItem = {
  key: string;
  kind: RewardCatalogKind;
  numericId: number;
  name: string;
  hashRate: number;
  slotSize: number;
  imageUrl: string | null;
  isActive: boolean;
};

export type RewardDraftState = {
  level: number;
  rewardKind: string;
  minerId: string;
  eventMinerId: string;
  hashRate: string;
  hashRateDays: string;
  blkAmount: string;
  polAmount: string;
  titleEn: string;
  titlePtBR: string;
  titleEs: string;
};

export type MissionDraftState = {
  cadence: string;
  missionType: string;
  targetValue: string;
  xpReward: string;
  titleEn: string;
  titlePtBR: string;
  titleEs: string;
  descriptionEn: string;
  descriptionPtBR: string;
  descriptionEs: string;
  gameSlug: string;
  sortOrder: string;
};

export function normalizeRewardCatalogItem(row: AdminMinerCatalogRow): RewardCatalogItem {
  const rawId = row?.id;
  const isEvent = typeof rawId === "string" && rawId.startsWith("event_");
  const numericId = Number(isEvent ? String(rawId).slice(6) : rawId);
  return {
    key: String(rawId),
    kind: isEvent ? "EVENT_MINER" : "SHOP_MINER",
    numericId: Number.isFinite(numericId) ? numericId : 0,
    name: String(row?.name || "").trim(),
    hashRate: Number(row?.baseHashRate || 0),
    slotSize: Number(row?.slotSize || 1),
    imageUrl: row?.imageUrl || null,
    isActive: Boolean(row?.isActive),
  };
}

export function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  variant = "default",
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
  variant?: "default" | "accent";
}) {
  const border = variant === "accent" ? "border-amber-500/25" : "border-slate-800";
  return (
    <section className={`rounded-2xl border ${border} bg-slate-900/50 overflow-hidden shadow-lg shadow-black/20`}>
      <header className="px-5 py-4 border-b border-slate-800/90 bg-slate-950/60">
        <div className="flex items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 text-amber-400">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-base font-black uppercase tracking-wide text-white">{title}</h2>
            {description ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p> : null}
          </div>
        </div>
      </header>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

export function FieldLabel({ htmlFor, label, hint }: { htmlFor?: string; label: string; hint?: string }) {
  const labelClass = "block text-xs font-bold uppercase tracking-wider text-slate-400";
  return (
    <div className="space-y-1">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelClass}>
          {label}
        </label>
      ) : (
        <span className={labelClass}>{label}</span>
      )}
      {hint ? <p className="text-[11px] leading-snug text-slate-600">{hint}</p> : null}
    </div>
  );
}

export function isGameSlugMissionType(missionType: string): boolean {
  return missionType === "PLAY_GAMES";
}

export function RewardMinerPicker({
  id,
  label,
  hint,
  query,
  onQueryChange,
  options,
  selected,
  onSelect,
  loading,
  t,
}: {
  id: string;
  label: string;
  hint?: string;
  query: string;
  onQueryChange: (q: string) => void;
  options: RewardCatalogItem[];
  selected: RewardCatalogItem | null;
  onSelect: (item: RewardCatalogItem) => void;
  loading: boolean;
  t: TFunction;
}) {
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel htmlFor={id} label={label} hint={hint} />
        <input
          id={id}
          className={INPUT_MT}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t("adminMiniPass.rewards.search_placeholder")}
        />
      </div>

      {selected ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-xs text-emerald-100">
          <div className="font-bold text-emerald-300">{selected.name}</div>
          <div className="mt-1 text-emerald-100/80">
            {t("adminMiniPass.rewards.selection_meta", {
              id: selected.numericId,
              hashRate: selected.hashRate,
              slotSize: selected.slotSize,
            })}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-800 bg-slate-950/60">
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("adminMiniPass.rewards.searching")}
          </div>
        ) : options.length > 0 ? (
          <div className="max-h-64 overflow-y-auto">
            {options.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item)}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-slate-800/70 ${
                  selected?.key === item.key ? "bg-amber-500/10" : ""
                }`}
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="h-10 w-10 rounded-lg border border-slate-700 object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-lg border border-slate-700 bg-slate-900" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{item.name}</div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {t("adminMiniPass.rewards.selection_meta", {
                      id: item.numericId,
                      hashRate: item.hashRate,
                      slotSize: item.slotSize,
                    })}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-3 py-3 text-xs text-slate-500">{t("adminMiniPass.rewards.search_empty")}</div>
        )}
      </div>
    </div>
  );
}

export function PreviewPanel({
  form,
  rewards,
  missions,
  t,
}: {
  form: SeasonFormState;
  rewards: AdminMiniPassLevelRewardRow[];
  missions: AdminMiniPassMissionRow[];
  t: TFunction;
}) {
  const tiers = useMemo(() => buildProgressionTiers(form.maxLevel, form.xpPerLevel), [form.maxLevel, form.xpPerLevel]);
  const byLevel = useMemo(() => {
    const m = new Map<number, AdminMiniPassLevelRewardRow>();
    (rewards || []).forEach((r) => m.set(r.level, r));
    return m;
  }, [rewards]);

  return (
    <aside className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950 p-5 shadow-xl lg:sticky lg:top-4">
      <div className="flex items-center gap-2 text-amber-400 mb-3">
        <Eye className="h-4 w-4 shrink-0" aria-hidden />
        <h3 className="text-xs font-black uppercase tracking-widest">{t("adminMiniPass.preview.title")}</h3>
      </div>
      <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">{t("adminMiniPass.preview.subtitle")}</p>

      {form.bannerImageUrl ? (
        <img
          src={form.bannerImageUrl}
          alt=""
          className="w-full h-24 object-cover rounded-xl border border-slate-700 mb-3"
        />
      ) : null}

      <p className="text-lg font-black text-white leading-tight">{form.titleEn || t("adminMiniPass.preview.untitled")}</p>
      {form.subtitleEn ? <p className="text-xs text-slate-400 mt-1 line-clamp-2">{form.subtitleEn}</p> : null}

      <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-slate-950/80 px-2 py-2 border border-slate-800">
          <dt className="text-slate-500 uppercase tracking-wider">{t("adminMiniPass.preview.starts")}</dt>
          <dd className="text-slate-200 font-mono truncate">{form.startsAt || "—"}</dd>
        </div>
        <div className="rounded-lg bg-slate-950/80 px-2 py-2 border border-slate-800">
          <dt className="text-slate-500 uppercase tracking-wider">{t("adminMiniPass.preview.ends")}</dt>
          <dd className="text-slate-200 font-mono truncate">{form.endsAt || "—"}</dd>
        </div>
        <div className="rounded-lg bg-slate-950/80 px-2 py-2 border border-slate-800">
          <dt className="text-slate-500 uppercase tracking-wider">{t("adminMiniPass.preview.max_level")}</dt>
          <dd className="text-amber-300 font-black">{form.maxLevel}</dd>
        </div>
        <div className="rounded-lg bg-slate-950/80 px-2 py-2 border border-slate-800">
          <dt className="text-slate-500 uppercase tracking-wider">{t("adminMiniPass.preview.xp_step")}</dt>
          <dd className="text-sky-300 font-black">{form.xpPerLevel} XP</dd>
        </div>
      </dl>

      <h4 className="mt-5 text-[10px] font-black uppercase tracking-widest text-slate-500">
        {t("adminMiniPass.preview.track_title")}
      </h4>
      <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-800/80">
        <table className="w-full text-left text-[10px]">
          <thead className="sticky top-0 bg-slate-950/95 text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="px-2 py-2">{t("adminMiniPass.preview.col_level")}</th>
              <th className="px-2 py-2">{t("adminMiniPass.preview.col_xp")}</th>
              <th className="px-2 py-2">{t("adminMiniPass.preview.col_reward")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-slate-300">
            {tiers.slice(0, 24).map((row) => (
              <tr key={row.level}>
                <td className="px-2 py-1.5 font-mono">{row.level}</td>
                <td className="px-2 py-1.5 font-mono text-sky-400/90">{row.minTotalXp}</td>
                <td className="px-2 py-1.5 text-slate-400 truncate max-w-[120px]" title={summarizeRewardRow(byLevel.get(row.level))}>
                  {byLevel.has(row.level) ? summarizeRewardRow(byLevel.get(row.level)) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tiers.length > 24 ? (
          <p className="px-2 py-2 text-[10px] text-slate-600 border-t border-slate-800">{t("adminMiniPass.preview.more_levels", { n: tiers.length - 24 })}</p>
        ) : null}
      </div>

      <h4 className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
        {t("adminMiniPass.preview.missions_title", { count: missions?.length ?? 0 })}
      </h4>
      <ul className="mt-2 space-y-1.5 text-[11px] text-slate-400 max-h-32 overflow-y-auto">
        {(missions || []).slice(0, 8).map((m) => (
          <li key={m.id} className="rounded-lg bg-slate-950/50 px-2 py-1.5 border border-slate-800/60">
            <span className="text-slate-200 font-medium">{m.titleI18n?.en || m.missionType}</span>
            <span className="text-slate-600"> · +{m.xpReward} XP</span>
          </li>
        ))}
        {(missions || []).length === 0 ? <li className="text-slate-600">{t("adminMiniPass.preview.no_missions")}</li> : null}
      </ul>
    </aside>
  );
}
