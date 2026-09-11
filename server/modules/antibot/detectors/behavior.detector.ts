/**
 * Port of legacy/server/modules/antibot/detectors/behavior.detector.ts.
 *
 * BehaviorDetector — flags machine-like interaction patterns. Looks for perfect intervals,
 * repetitive sequences, impossible speed, and non-stop sessions. These are strong automation
 * indicators but never used alone to convict a user.
 */
import type { AntibotDetector, AntibotEvidence, DetectorContext } from "../antibot.types.js";
import { resolveWeight } from "../antibot.weights.js";

const PERFECT_INTERVAL_CV = 0.05; // coefficient of variation below this = robotic
const NON_STOP_HOURS = 16;

export const behaviorDetector: AntibotDetector = {
  name: "behavior",
  async detect(ctx: DetectorContext): Promise<AntibotEvidence[]> {
    const out: AntibotEvidence[] = [];
    const bhv = ctx.telemetry.behavior ?? {};

    if (bhv.impossibleSpeed === true) {
      out.push({ detector: "behavior", code: "impossible_speed", ...resolveWeight("impossible_speed") });
    }

    // Perfect / near-perfect intervals (low variance relative to mean)
    const cv = typeof bhv.intervalCv === "number" ? bhv.intervalCv : null;
    if (cv !== null && cv < PERFECT_INTERVAL_CV && (bhv.navigationEvents ?? 0) >= 6) {
      out.push({
        detector: "behavior",
        code: "perfect_intervals",
        ...resolveWeight("perfect_intervals"),
        metadata: { cv, events: bhv.navigationEvents, avgMs: bhv.avgActionIntervalMs },
      });
    }

    if ((bhv.repetitiveSequences ?? 0) >= 3) {
      out.push({
        detector: "behavior",
        code: "repetitive_behavior",
        ...resolveWeight("repetitive_behavior"),
        metadata: { sequences: bhv.repetitiveSequences },
      });
    }

    const durationHours = (bhv.sessionDurationMs ?? 0) / 3_600_000;
    if (durationHours >= NON_STOP_HOURS) {
      out.push({
        detector: "behavior",
        code: "non_stop_session",
        ...resolveWeight("non_stop_session"),
        metadata: { sessionHours: Math.round(durationHours * 10) / 10 },
      });
    }

    if (bhv.humanLikeInput === false && (bhv.navigationEvents ?? 0) >= 10) {
      out.push({ detector: "behavior", code: "no_human_input", ...resolveWeight("no_human_input") });
    }

    return out;
  },
};
