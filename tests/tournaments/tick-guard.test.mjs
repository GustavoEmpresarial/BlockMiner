/**
 * Concurrency tests for the cron reentrancy guard.
 *
 * The bug this guards against: every tournament interval job was scheduled bare,
 * so a tick slower than its interval ran concurrently with itself. Two runs
 * inside finalizeTournament for the same id both read status=ACTIVE, both enter
 * the `recurring` branch, and the series forks into two duplicate tournaments.
 *
 * Pure module, no database — see tournaments.tick-guard.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";

// Both guards are pulled in by this ONE top-level await. Do not add another
// `await import(...)` further down the file: node:test begins running once the
// first tick of the event loop is reached, and a mid-file top-level await
// registers everything after it too late — those tests are silently skipped,
// reported as passing, and never execute.
const { nonOverlapping, keyedSingleFlight } = await import(
  "../../server/modules/tournaments/tournaments.tick-guard.ts"
);

/** A promise whose resolution this test controls, so overlap is deterministic. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("a second tick is dropped while the first is still running", async () => {
  const gate = deferred();
  let started = 0;

  const tick = nonOverlapping(async () => {
    started++;
    await gate.promise;
  });

  const first = tick();
  await tick(); // arrives mid-flight — must not start the job
  await tick();

  assert.equal(started, 1, "job ran more than once concurrently");

  gate.resolve();
  await first;
});

test("the guard releases after the job settles, so later ticks run", async () => {
  let started = 0;
  const tick = nonOverlapping(async () => {
    started++;
  });

  await tick();
  await tick();
  await tick();

  assert.equal(started, 3, "guard stayed latched after the job finished");
});

test("a rejecting job releases the guard instead of wedging the schedule", async () => {
  let started = 0;
  const tick = nonOverlapping(async () => {
    started++;
    throw new Error("boom");
  });

  await assert.rejects(tick(), /boom/, "the rejection must still reach the caller");
  await assert.rejects(tick(), /boom/);

  assert.equal(started, 2, "a failed tick permanently blocked every later tick");
});

test("onSkip fires only for dropped ticks", async () => {
  const gate = deferred();
  let skips = 0;

  const tick = nonOverlapping(
    async () => {
      await gate.promise;
    },
    () => {
      skips++;
    },
  );

  const first = tick();
  assert.equal(skips, 0, "the first tick must not count as skipped");

  await tick();
  await tick();
  assert.equal(skips, 2);

  gate.resolve();
  await first;

  await tick();
  assert.equal(skips, 2, "a tick that actually ran was counted as skipped");
});

test("a throwing onSkip does not break the guard", async () => {
  const gate = deferred();
  let started = 0;

  const tick = nonOverlapping(
    async () => {
      started++;
      await gate.promise;
    },
    () => {
      throw new Error("logger exploded");
    },
  );

  const first = tick();
  await tick(); // onSkip throws in here; must be swallowed

  gate.resolve();
  await first;

  await tick();
  assert.equal(started, 2, "guard was left latched by a throwing onSkip");
});

test("concurrent callers cannot both enter the job", async () => {
  const gate = deferred();
  let concurrent = 0;
  let maxConcurrent = 0;

  const tick = nonOverlapping(async () => {
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await gate.promise;
    concurrent--;
  });

  const all = Promise.all([tick(), tick(), tick(), tick()]);
  gate.resolve();
  await all;

  assert.equal(maxConcurrent, 1, "two ticks were inside the job at the same time");
});

// ─── keyedSingleFlight ───────────────────────────────────────────────────────
// Guards finalizeTournament against the cron tick and the admin finalize button
// entering it for the same tournament id at once.

test("same key coalesces onto one run and both callers get its result", async () => {
  const gate = deferred();
  let runs = 0;

  const finalize = keyedSingleFlight(async () => {
    runs++;
    await gate.promise;
    return { nextId: 99 };
  });

  const cron = finalize(42);
  const admin = finalize(42);

  gate.resolve();
  const [a, b] = await Promise.all([cron, admin]);

  assert.equal(runs, 1, "finalize ran twice for the same tournament");
  assert.deepEqual(a, { nextId: 99 });
  assert.deepEqual(b, a, "the second caller got a different result");
});

test("different keys still run in parallel", async () => {
  const gate = deferred();
  let concurrent = 0;
  let maxConcurrent = 0;

  const finalize = keyedSingleFlight(async () => {
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await gate.promise;
    concurrent--;
  });

  const all = Promise.all([finalize(1), finalize(2), finalize(3)]);
  gate.resolve();
  await all;

  assert.equal(maxConcurrent, 3, "distinct tournaments were serialised against each other");
});

test("the key is released after settling, so a later finalize runs again", async () => {
  let runs = 0;
  const finalize = keyedSingleFlight(async () => {
    runs++;
  });

  await finalize(7);
  await finalize(7);

  assert.equal(runs, 2, "the key stayed latched after the run finished");
});

test("a rejection reaches every joined caller and releases the key", async () => {
  const gate = deferred();
  let runs = 0;

  const finalize = keyedSingleFlight(async () => {
    runs++;
    await gate.promise;
    throw new Error("finalize blew up");
  });

  const cron = finalize(5);
  const admin = finalize(5);
  gate.resolve();

  await assert.rejects(cron, /finalize blew up/);
  await assert.rejects(admin, /finalize blew up/, "the joined caller swallowed the failure");
  assert.equal(runs, 1);

  // key released despite the rejection
  const after = keyedSingleFlight(async () => "ok");
  assert.equal(await after(5), "ok");
});
