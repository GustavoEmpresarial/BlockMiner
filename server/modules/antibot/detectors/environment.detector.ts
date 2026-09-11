/**
 * Environment consistency — client-reported timezone / language mismatches.
 * Weak-ish signals; only meaningful when corroborated (see antibot.weights tiers).
 */
import type { AntibotDetector, AntibotEvidence, DetectorContext } from "../antibot.types.js";
import { resolveWeight } from "../antibot.weights.js";

export const environmentDetector: AntibotDetector = {
  name: "environment",
  async detect(ctx: DetectorContext): Promise<AntibotEvidence[]> {
    const out: AntibotEvidence[] = [];
    const env = ctx.telemetry.environment ?? {};

    if (env.mismatchedTimezone === true) {
      out.push({
        detector: "environment",
        code: "timezone_mismatch",
        ...resolveWeight("timezone_mismatch"),
        metadata: {
          timezone: env.timezone ?? null,
          timezoneOffset: env.timezoneOffset ?? null,
        },
      });
    }

    const langs = env.languages ?? [];
    if (env.language && langs.length && !langs.includes(env.language)) {
      out.push({
        detector: "environment",
        code: "spoofed_language",
        ...resolveWeight("spoofed_language"),
        metadata: { language: env.language, languages: langs },
      });
    }

    return out;
  },
};
