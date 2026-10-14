import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  enabledPreviewMetrics,
  isPreviewTournamentId,
  previewTournamentId,
} from "../../server/modules/tournaments/tournaments.preview.ts";

const ORIGINAL = process.env.TOURNAMENT_PREVIEW_METRICS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.TOURNAMENT_PREVIEW_METRICS;
  else process.env.TOURNAMENT_PREVIEW_METRICS = ORIGINAL;
});

describe("dev preview tournaments", () => {
  it("are off unless TOURNAMENT_PREVIEW_METRICS is set", () => {
    delete process.env.TOURNAMENT_PREVIEW_METRICS;
    assert.equal(enabledPreviewMetrics().size, 0);
    assert.equal(isPreviewTournamentId(previewTournamentId("MERGES", "DAILY")), false);
  });

  it("only enable known metrics", () => {
    process.env.TOURNAMENT_PREVIEW_METRICS = "merges, BURNS,OFFERS_ALL";
    assert.deepEqual([...enabledPreviewMetrics()].sort(), ["BURNS", "MERGES"]);
  });

  it("use negative ids that never collide with real tournaments", () => {
    process.env.TOURNAMENT_PREVIEW_METRICS = "MERGES,BURNS,TASKS_COMPLETED";
    const ids = [
      previewTournamentId("MERGES", "DAILY"),
      previewTournamentId("MERGES", "WEEKLY"),
      previewTournamentId("MERGES", "MONTHLY"),
      previewTournamentId("BURNS", "DAILY"),
      previewTournamentId("TASKS_COMPLETED", "WEEKLY"),
      previewTournamentId("TASKS_COMPLETED", "MONTHLY"),
    ];
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) {
      assert.ok(id < 0);
      assert.equal(isPreviewTournamentId(id), true);
    }
    assert.equal(isPreviewTournamentId(325), false);
    assert.equal(isPreviewTournamentId(-1), false);
  });
});
