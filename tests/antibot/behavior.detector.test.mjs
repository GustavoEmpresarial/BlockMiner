import test from "node:test";
import assert from "node:assert/strict";

const { behaviorDetector } = await import("../../server/modules/antibot/detectors/behavior.detector.ts");

function ctx(behavior) {
  return { prisma: {}, telemetry: { behavior }, userId: 1, ip: "1.2.3.4", userAgent: "", sessionId: "s1", eventType: "game:test" };
}

test("behaviorDetector: impossibleSpeed → impossible_speed evidence", async () => {
  const ev = await behaviorDetector.detect(ctx({ impossibleSpeed: true }));
  assert.ok(ev.some((e) => e.code === "impossible_speed"));
});

test("behaviorDetector: near-zero interval variance with >= 6 events → perfect_intervals", async () => {
  const ev = await behaviorDetector.detect(ctx({ intervalCv: 0.01, navigationEvents: 10 }));
  assert.ok(ev.some((e) => e.code === "perfect_intervals"));
});

test("behaviorDetector: high variance intervals → no perfect_intervals", async () => {
  const ev = await behaviorDetector.detect(ctx({ intervalCv: 0.5, navigationEvents: 10 }));
  assert.ok(!ev.some((e) => e.code === "perfect_intervals"));
});

test("behaviorDetector: repetitiveSequences >= 3 → repetitive_behavior", async () => {
  const ev = await behaviorDetector.detect(ctx({ repetitiveSequences: 3 }));
  assert.ok(ev.some((e) => e.code === "repetitive_behavior"));
});

test("behaviorDetector: sessionDurationMs >= 16h → non_stop_session", async () => {
  const ev = await behaviorDetector.detect(ctx({ sessionDurationMs: 17 * 3_600_000 }));
  assert.ok(ev.some((e) => e.code === "non_stop_session"));
});

test("behaviorDetector: humanLikeInput === false with >= 10 events → no_human_input", async () => {
  const ev = await behaviorDetector.detect(ctx({ humanLikeInput: false, navigationEvents: 12 }));
  assert.ok(ev.some((e) => e.code === "no_human_input"));
});

test("behaviorDetector: clean human-like telemetry → no evidence", async () => {
  const ev = await behaviorDetector.detect(
    ctx({ intervalCv: 0.4, navigationEvents: 8, repetitiveSequences: 0, sessionDurationMs: 600_000, humanLikeInput: true }),
  );
  assert.deepEqual(ev, []);
});
