import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeCheckinStreakFromDateKeys,
  computeStreakAdvanceFromHistory,
  resolveLiveStreakFromRows,
} from "../../server/modules/checkin/checkin.streak.ts";
import { detectStreakAnomalies } from "../../server/modules/checkin/checkin.monitor.ts";

describe("grace streak advance (zKaiser regression)", () => {
  it("grace check-in increments persisted streak, not key-walk length", () => {
    // Missed 2026-08-29; check-in on 2026-08-30 within 6h grace after UTC midnight.
    const now = new Date("2026-08-30T01:37:00Z");
    const history = [
      { checkinDate: "2026-08-28", streak: 99 },
      { checkinDate: "2026-08-27", streak: 98 },
    ];
    const advance = computeStreakAdvanceFromHistory({
      periodKey: "2026-08-30",
      now,
      history,
      graceHours: 6,
      graceUsesThisMonth: 0,
      freezeUsesThisMonth: 0,
      maxGracePerMonth: 2,
      maxFreezePerMonth: 1,
      freezeEnabled: true,
    });
    assert.equal(advance.usedGrace, true);
    assert.equal(advance.streakAfter, 100);
  });

  it("day after grace uses persisted streak (does not collapse to 2)", () => {
    const now = new Date("2026-08-31T14:02:00Z");
    const history = [
      { checkinDate: "2026-08-30", streak: 100 },
      { checkinDate: "2026-08-28", streak: 99 },
    ];
    const advance = computeStreakAdvanceFromHistory({
      periodKey: "2026-08-31",
      now,
      history,
      graceHours: 6,
      graceUsesThisMonth: 1,
      freezeUsesThisMonth: 0,
      maxGracePerMonth: 2,
      maxFreezePerMonth: 1,
      freezeEnabled: true,
    });
    assert.equal(advance.usedGrace, false);
    assert.equal(advance.usedFreeze, false);
    assert.equal(advance.streakAfter, 101);
  });

  it("live streak prefers persisted row after grace gap (key-walk alone would be 1)", () => {
    const now = new Date("2026-08-30T12:00:00Z");
    const rows = [
      { checkinDate: "2026-08-30", streak: 100 },
      { checkinDate: "2026-08-28", streak: 99 },
    ];
    // Key-walk from today stops at gap → 1
    assert.equal(
      computeCheckinStreakFromDateKeys(
        rows.map((r) => r.checkinDate),
        now,
        6,
      ),
      1,
    );
    assert.equal(resolveLiveStreakFromRows(rows, now, 6), 100);
  });

  it("monitor flags collapse the day after a grace check-in", () => {
    const anomalies = detectStreakAnomalies([
      { userId: 1342, checkinDate: "2026-08-28", streak: 99, usedGrace: false, usedFreeze: false },
      { userId: 1342, checkinDate: "2026-08-30", streak: 100, usedGrace: true, usedFreeze: false },
      { userId: 1342, checkinDate: "2026-08-31", streak: 2, usedGrace: false, usedFreeze: false },
    ]);
    assert.ok(anomalies.some((a) => a.kind === "unexpected_drop_next_day" && a.userId === 1342));
  });
});
