import type { AdminMiniPassSeasonState } from '../useAdminMiniPassSeason';
import { Target, Plus, Trash2 } from 'lucide-react';
import { SectionCard, FieldLabel, INPUT_MT, TEXTAREA_MT, MISSION_TYPES, CADENCES, isGameSlugMissionType } from '../adminMiniPassSeason.parts';

export function MiniPassMissionsSection({ s }: { s: AdminMiniPassSeasonState }) {
  const { t, missions, missionDraft, setMissionDraft, addMission, deleteMission } = s;
  return (
              <SectionCard icon={Target} title={t("adminMiniPass.sections.missions")} description={t("adminMiniPass.sections.missions_desc")}>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 md:p-6 space-y-8">
                  <header className="space-y-1">
                    <h3 className="text-sm font-bold text-white">{t("adminMiniPass.missions.form_title")}</h3>
                    <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">{t("adminMiniPass.missions.form_help")}</p>
                  </header>

                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-800 pb-2 mb-4">
                      {t("adminMiniPass.missions.group_rules")}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <FieldLabel
                          htmlFor="mp-msn-cadence"
                          label={t("adminMiniPass.missions.cadence")}
                          hint={t("adminMiniPass.missions.cadence_hint")}
                        />
                        <select
                          id="mp-msn-cadence"
                          className={INPUT_MT}
                          value={missionDraft.cadence}
                          onChange={(e) => setMissionDraft({ ...missionDraft, cadence: e.target.value })}
                        >
                          {CADENCES.map((c) => (
                            <option key={c} value={c}>
                              {t(`adminMiniPass.cadences.${c}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <FieldLabel
                          htmlFor="mp-msn-type"
                          label={t("adminMiniPass.missions.type")}
                          hint={t("adminMiniPass.missions.type_hint")}
                        />
                        <select
                          id="mp-msn-type"
                          className={INPUT_MT}
                          value={missionDraft.missionType}
                          onChange={(e) => {
                            const missionType = e.target.value;
                            setMissionDraft((prev) => ({
                              ...prev,
                              missionType,
                              gameSlug: isGameSlugMissionType(missionType) ? prev.gameSlug : "",
                            }));
                          }}
                        >
                          {MISSION_TYPES.map((c) => (
                            <option key={c} value={c}>
                              {t(`adminMiniPass.mission_types.${c}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-800 pb-2 mb-4">
                      {t("adminMiniPass.missions.group_numbers")}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div>
                        <FieldLabel
                          htmlFor="mp-msn-target"
                          label={t("adminMiniPass.missions.target")}
                          hint={t(`adminMiniPass.missions.target_hint_${missionDraft.missionType}`)}
                        />
                        <input
                          id="mp-msn-target"
                          className={INPUT_MT}
                          value={missionDraft.targetValue}
                          onChange={(e) => setMissionDraft({ ...missionDraft, targetValue: e.target.value })}
                          placeholder="1"
                        />
                      </div>
                      <div>
                        <FieldLabel
                          htmlFor="mp-msn-xp"
                          label={t("adminMiniPass.missions.xp_reward")}
                          hint={t("adminMiniPass.missions.xp_hint")}
                        />
                        <input
                          id="mp-msn-xp"
                          className={INPUT_MT}
                          value={missionDraft.xpReward}
                          onChange={(e) => setMissionDraft({ ...missionDraft, xpReward: e.target.value })}
                          placeholder="50"
                        />
                      </div>
                      <div>
                        <FieldLabel
                          htmlFor="mp-msn-sort"
                          label={t("adminMiniPass.missions.sort_order")}
                          hint={t("adminMiniPass.missions.sort_hint")}
                        />
                        <input
                          id="mp-msn-sort"
                          type="number"
                          className={INPUT_MT}
                          value={missionDraft.sortOrder}
                          onChange={(e) => setMissionDraft({ ...missionDraft, sortOrder: e.target.value })}
                        />
                      </div>
                      {isGameSlugMissionType(missionDraft.missionType) ? (
                        <div className="sm:col-span-2 lg:col-span-3">
                          <FieldLabel
                            htmlFor="mp-msn-game"
                            label={t("adminMiniPass.missions.game_slug")}
                            hint={t("adminMiniPass.missions.game_slug_hint")}
                          />
                          <input
                            id="mp-msn-game"
                            className={INPUT_MT}
                            value={missionDraft.gameSlug}
                            onChange={(e) => setMissionDraft({ ...missionDraft, gameSlug: e.target.value })}
                            placeholder="memory-sync"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-800 pb-2 mb-4">
                      {t("adminMiniPass.missions.group_copy")}
                    </p>
                    <div className="space-y-4">
                      <FieldLabel label={t("adminMiniPass.missions.titles_required")} hint={t("adminMiniPass.missions.titles_field_hint")} />
                      <div className="grid grid-cols-1 gap-4">
                        {(
                          [
                            { key: "titleEn" as const, lab: t("adminMiniPass.locale.en"), id: "mp-msn-title-en" },
                            { key: "titlePtBR" as const, lab: t("adminMiniPass.locale.pt"), id: "mp-msn-title-pt" },
                            { key: "titleEs" as const, lab: t("adminMiniPass.locale.es"), id: "mp-msn-title-es" },
                          ] as const
                        ).map(({ key, lab, id }) => (
                          <div key={key}>
                            <label htmlFor={id} className="text-xs font-semibold text-slate-400">
                              {lab}
                            </label>
                            <input
                              id={id}
                              className={INPUT_MT}
                              placeholder={t("adminMiniPass.placeholders.mission_title")}
                              value={missionDraft[key]}
                              onChange={(e) => setMissionDraft({ ...missionDraft, [key]: e.target.value })}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3 mt-6">
                      <FieldLabel
                        label={t("adminMiniPass.missions.descriptions_optional")}
                        hint={t("adminMiniPass.missions.descriptions_field_hint")}
                      />
                      <div className="grid grid-cols-1 gap-4">
                        {(
                          [
                            { key: "descriptionEn" as const, lab: t("adminMiniPass.locale.en"), id: "mp-msn-desc-en" },
                            { key: "descriptionPtBR" as const, lab: t("adminMiniPass.locale.pt"), id: "mp-msn-desc-pt" },
                            { key: "descriptionEs" as const, lab: t("adminMiniPass.locale.es"), id: "mp-msn-desc-es" },
                          ] as const
                        ).map(({ key, lab, id }) => (
                          <div key={key}>
                            <label htmlFor={id} className="text-xs font-semibold text-slate-400">
                              {lab}
                            </label>
                            <textarea
                              id={id}
                              rows={3}
                              className={TEXTAREA_MT}
                              placeholder={t("adminMiniPass.placeholders.mission_description")}
                              value={missionDraft[key]}
                              onChange={(e) => setMissionDraft({ ...missionDraft, [key]: e.target.value })}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void addMission()}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-100 text-slate-900 text-xs font-black uppercase tracking-wide border border-slate-200 hover:bg-white"
                  >
                    <Plus className="w-4 h-4 shrink-0" aria-hidden />
                    {t("adminMiniPass.missions.add_button")}
                  </button>
                </div>

                {missions.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6 rounded-xl border border-dashed border-slate-700">{t("adminMiniPass.missions.empty")}</p>
                ) : (
                  <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 overflow-hidden">
                    {missions.map((m) => {
                      const desc = m.descriptionI18n?.en || "";
                      return (
                        <li key={m.id} className="px-4 py-3 flex justify-between gap-3 bg-slate-950/30">
                          <div className="min-w-0">
                            <p className="text-sm text-white font-medium">
                              {m.titleI18n?.en || m.missionType}{" "}
                              <span className="text-slate-500 font-normal text-xs">
                                · {t(`adminMiniPass.cadences.${m.cadence}`)} · {t(`adminMiniPass.mission_types.${m.missionType}`)}
                              </span>
                            </p>
                            <p className="text-xs text-sky-400/90 mt-0.5">
                              {t("adminMiniPass.missions.line_meta", {
                                target: String(m.targetValue),
                                xp: m.xpReward,
                              })}
                            </p>
                            {desc ? <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{desc}</p> : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => void deleteMission(m.id)}
                            className="shrink-0 p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                            aria-label={t("adminMiniPass.delete")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SectionCard>
  );
}
