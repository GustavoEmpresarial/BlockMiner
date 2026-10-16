import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isTasksPreviewMode, liveCatalogWhere } from "../../server/modules/tasks/tasks.preview.ts";
import { TASK_TYPE_BY_ACTION_PROVIDER } from "../../server/modules/tasks/tasks.constants.ts";
import { TOURNAMENT_ACTION_PROVIDER } from "../../server/modules/tournaments/tournaments.providers.ts";

const ORIGINAL = process.env.TASKS_PREVIEW_CATALOG;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.TASKS_PREVIEW_CATALOG;
  else process.env.TASKS_PREVIEW_CATALOG = ORIGINAL;
});

describe("task catalog preview", () => {
  it("production uses only active definitions", () => {
    delete process.env.TASKS_PREVIEW_CATALOG;
    assert.equal(isTasksPreviewMode(), false);
    assert.deepEqual(liveCatalogWhere(), { isActive: true });
  });

  it("dev preview uses only the v2 catalog, never the active production rows", () => {
    process.env.TASKS_PREVIEW_CATALOG = "1";
    assert.equal(isTasksPreviewMode(), true);
    assert.deepEqual(liveCatalogWhere(), { slug: { startsWith: "v2-" } });
  });
});

describe("action provider → task type", () => {
  it("covers every offerwall source with one offers task", () => {
    for (const p of ["INTERNAL", "OFFERWALLME", "ZERADS", "MONEYRAIN", "MULTIWALL", "OFFERWALLGG"]) {
      assert.equal(TASK_TYPE_BY_ACTION_PROVIDER[TOURNAMENT_ACTION_PROVIDER[p]], "COMPLETE_OFFERS");
    }
  });

  it("leaves YouTube, minigames and check-in to their own hooks (no double count)", () => {
    for (const p of ["YOUTUBE", "MINIGAME", "CHECKIN"]) {
      assert.equal(TASK_TYPE_BY_ACTION_PROVIDER[TOURNAMENT_ACTION_PROVIDER[p]], undefined);
    }
  });
});
