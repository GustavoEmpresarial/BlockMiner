import test from "node:test";
import assert from "node:assert/strict";

const constants = await import("../../server/modules/games/game2048/game2048.constants.ts");

test("rewardDurationFromCheckinToday grants the full-day boost only when checked in today", () => {
  const withCheckin = constants.rewardDurationFromCheckinToday(true);
  assert.equal(withCheckin.rewardPowerHours, null);
  assert.equal(withCheckin.rewardPowerDays, constants.game2048PowerDays());

  const withoutCheckin = constants.rewardDurationFromCheckinToday(false);
  assert.equal(withoutCheckin.rewardPowerDays, null);
  assert.ok(withoutCheckin.rewardPowerHours > 0);
});

test("game2048WinTile clamps to [8, 131072]", () => {
  assert.ok(constants.game2048WinTile() >= 8);
  assert.ok(constants.game2048WinTile() <= 131072);
});

test("game2048CooldownMs clamps to [0, 86400000]", () => {
  const ms = constants.game2048CooldownMs();
  assert.ok(ms >= 0 && ms <= 86_400_000);
});
