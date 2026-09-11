import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import { Calendar } from "lucide-react";
import ImageUploader from '../../../../shared/components/ImageUploader';
import { FieldLabel, SectionCard, type SeasonFormState } from "../adminMiniPassSeason.parts";

type MiniPassDetailsSectionProps = {
  form: SeasonFormState;
  isNew: boolean;
  setForm: Dispatch<SetStateAction<SeasonFormState>>;
  t: TFunction;
};

export function MiniPassDetailsSection({ form, isNew, setForm, t }: MiniPassDetailsSectionProps) {
  return (
    <SectionCard
      icon={Calendar}
      title={t("adminMiniPass.sections.pass")}
      description={t("adminMiniPass.sections.pass_desc")}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <FieldLabel
            htmlFor="mp-slug"
            label={t("adminMiniPass.fields.slug")}
            hint={t("adminMiniPass.fields.slug_hint")}
          />
          <input
            id="mp-slug"
            className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-600"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder={t("adminMiniPass.placeholders.slug")}
            required
            disabled={!isNew}
          />
        </div>
        <div>
          <FieldLabel
            htmlFor="mp-banner"
            label={t("adminMiniPass.fields.banner")}
            hint={t("adminMiniPass.fields.banner_hint")}
          />
          <div className="mt-2" id="mp-banner">
            <ImageUploader
              value={form.bannerImageUrl}
              onChange={(url: string) => setForm({ ...form, bannerImageUrl: url })}
            />
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
          {t("adminMiniPass.fields.titles")}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(
            [
              { key: "titleEn" as const, lab: t("adminMiniPass.locale.en") },
              { key: "titlePtBR" as const, lab: t("adminMiniPass.locale.pt") },
              { key: "titleEs" as const, lab: t("adminMiniPass.locale.es") },
            ] as const
          ).map(({ key, lab }) => (
            <div key={key}>
              <label className="text-[10px] uppercase text-slate-500">{lab}</label>
              <input
                className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                required={key === "titleEn"}
                placeholder={t("adminMiniPass.placeholders.season_title")}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
          {t("adminMiniPass.fields.subtitles_optional")}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(
            [
              { key: "subtitleEn" as const, lab: t("adminMiniPass.locale.en") },
              { key: "subtitlePtBR" as const, lab: t("adminMiniPass.locale.pt") },
              { key: "subtitleEs" as const, lab: t("adminMiniPass.locale.es") },
            ] as const
          ).map(({ key, lab }) => (
            <div key={key}>
              <label className="text-[10px] uppercase text-slate-500">{lab}</label>
              <input
                className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                placeholder={t("adminMiniPass.placeholders.subtitle")}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel
            htmlFor="mp-start"
            label={t("adminMiniPass.fields.starts_at")}
            hint={t("adminMiniPass.fields.starts_hint")}
          />
          <input
            id="mp-start"
            type="datetime-local"
            className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-white"
            value={form.startsAt}
            onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            required
          />
        </div>
        <div>
          <FieldLabel
            htmlFor="mp-end"
            label={t("adminMiniPass.fields.ends_at")}
            hint={t("adminMiniPass.fields.ends_hint")}
          />
          <input
            id="mp-end"
            type="datetime-local"
            className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-white"
            value={form.endsAt}
            onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            required
          />
        </div>
      </div>
    </SectionCard>
  );
}
