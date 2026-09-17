/**
 * Reentrancy guard for interval jobs — no imports, no I/O, so it is unit-testable
 * without a database or a logger (same shape as tournament-window.ts and
 * tournaments.prize-resolution.ts).
 *
 * `setInterval` does not wait for the previous callback to settle. Every
 * tournament cron job was scheduled bare, so a tick slower than its own interval
 * ran concurrently with itself. For the 60s lifecycle tick that meant two runs
 * inside `finalizeTournament` for the SAME tournament id. The atomic
 * rewardGranted claim stops a prize being paid twice, but nothing else was
 * protected:
 *
 *   - both runs write ranks concurrently, so the persisted rank can come from
 *     whichever batch landed last instead of from the final scoring pass;
 *   - both read `status: ACTIVE` before either writes ENDED, so both enter the
 *     `recurring` branch and `prisma.tournament.create` runs twice — the series
 *     silently forks into two parallel tournaments with the same name.
 *
 * The outbox job has the same shape on a 5s interval, where overlap is far likelier.
 */

/**
 * Coalesces concurrent calls that share a key onto a single in-flight run.
 *
 * `nonOverlapping` only guards one scheduler against itself, which is not enough
 * for `finalizeTournament`: the cron lifecycle tick and the admin
 * `POST /admin/tournaments/:id/finalize` button are two independent callers that
 * can enter it for the same tournament id at the same moment, reproducing the
 * duplicate-recurring-spawn race in full. Keying the guard on the tournament id
 * closes it for every caller instead of per scheduler.
 *
 * The entry is removed once the run settles, so a later finalize of the same
 * tournament still works, and a rejection propagates to every caller waiting on it.
 *
 * Scope: per process, same as `nonOverlapping`.
 */

/**
 * Wraps `job` so it can never run concurrently with itself.
 *
 * A tick that arrives while the previous one is still running is DROPPED, not
 * queued: these are periodic reconciliation jobs, so the next interval covers
 * whatever this one would have done. Queueing would build an unbounded backlog
 * of work that is already stale by the time it runs.
 *
 * `onSkip` is injected rather than imported so this module stays dependency-free;
 * the cron passes its logger. A throwing `onSkip` must not take the guard down
 * with it, so it is called defensively.
 *
 * The guard is released in a `finally`, so a job that rejects does not wedge the
 * schedule permanently — the rejection still propagates to the caller.
 *
 * Scope: per process. This does NOT make a job safe to run in two replicas at
 * once; that needs a database-level lock.
 */
export function keyedSingleFlight<K, R>(job: (key: K) => Promise<R>): (key: K) => Promise<R> {
  const inFlight = new Map<K, Promise<R>>();
  return (key: K) => {
    const existing = inFlight.get(key);
    // Coalesce rather than drop: the second caller is a real request (the admin
    // "finalize" button) and deserves the actual outcome, not silence. Both get
    // the same result because it IS the same run.
    if (existing) return existing;
    const run = Promise.resolve()
      .then(() => job(key))
      .finally(() => {
        inFlight.delete(key);
      });
    inFlight.set(key, run);
    return run;
  };
}

export function nonOverlapping(
  job: () => Promise<void>,
  onSkip?: () => void,
): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) {
      try {
        onSkip?.();
      } catch {
        // Reporting a skipped tick must never break the schedule.
      }
      return;
    }
    running = true;
    try {
      await job();
    } finally {
      running = false;
    }
  };
}
