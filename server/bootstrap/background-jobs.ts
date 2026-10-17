/**
 * Web-only mode for an instance that shares the production database without owning it — the
 * dev VM. With BLOCKMINER_BACKGROUND_JOBS=off the process serves HTTP and sockets but starts no
 * cron (mining settlement, BLK cycle, deposit scanner, withdrawal auto-send, outbox publisher,
 * Telegram bots, backups…) and runs no boot-time data writes (admin seed, offer seed, reward
 * sync, showcase refund migration). The production app keeps owning all of those.
 *
 * Found 2026-10-17: the dev VM ran the full app against production through an SSH tunnel; its
 * stale BLK cron won the cycle race five times, its outbox publisher diverted events to its own
 * Kafka, and its deposit scanner swept the same HD addresses as production.
 */
export function backgroundJobsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.BLOCKMINER_BACKGROUND_JOBS ?? "on").trim().toLowerCase() !== "off";
}

export const NO_JOB = { stop: () => {} } as const;

/** Starts a cron only when background jobs are enabled; otherwise returns a no-op handle. */
export function startJob<T extends { stop: () => void }>(enabled: boolean, start: () => T): T | typeof NO_JOB {
  return enabled ? start() : NO_JOB;
}
