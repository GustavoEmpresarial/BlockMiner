/**
 * Web-only mode (BLOCKMINER_BACKGROUND_JOBS=off) for an instance sharing the production DB.
 * Unit for the switch, plus a structural check that no cron or boot-time write escapes it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { backgroundJobsEnabled, startJob, NO_JOB } = await import("../../server/bootstrap/background-jobs.ts");

test("background jobs are ON unless explicitly turned off", () => {
  assert.equal(backgroundJobsEnabled({}), true, "default stays on (production)");
  for (const v of ["on", "1", "true", "", "yes"]) assert.equal(backgroundJobsEnabled({ BLOCKMINER_BACKGROUND_JOBS: v }), true, v);
  for (const v of ["off", "OFF", " off "]) assert.equal(backgroundJobsEnabled({ BLOCKMINER_BACKGROUND_JOBS: v }), false, v);
});

test("startJob starts only when enabled and always returns something stoppable", () => {
  let started = 0;
  const handle = { stop: () => {} };
  assert.equal(startJob(true, () => (started++, handle)), handle);
  assert.equal(startJob(false, () => (started++, handle)), NO_JOB);
  assert.equal(started, 1);
  assert.doesNotThrow(() => NO_JOB.stop());
});

test("server.ts starts every cron through startJob and keeps boot-time writes behind the switch", () => {
  const src = fs.readFileSync("server/bootstrap/server.ts", "utf8");
  const direct = src.match(/=\s*start[A-Za-z]+(Cron|CronFromBootstrap)\(\)/g) ?? [];
  assert.deepEqual(direct, [], "no cron started directly");
  assert.ok((src.match(/startJob\(jobsEnabled, start[A-Za-z]+\)/g) ?? []).length >= 23);
  for (const fn of ["ensureMinercoreMcx9Offer", "bootstrapAdminUsers", "applyInternalOfferwallStandardBlkReward", "runShowcase3dPurgeAndRefundMigration"]) {
    const at = src.indexOf(`await ${fn}(`);
    assert.ok(at > 0, fn);
    const guard = src.lastIndexOf("if (jobsEnabled) {", at);
    const closed = src.lastIndexOf("\n    }", at);
    assert.ok(guard > 0 && guard > closed, `${fn} runs only inside if (jobsEnabled)`);
  }
});
