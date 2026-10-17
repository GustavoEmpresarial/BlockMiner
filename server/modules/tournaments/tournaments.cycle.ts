/**
 * One open DAILY/WEEKLY/MONTHLY window per metric.
 *
 * The lifecycle cron is per process. Two app processes (a restart still inside
 * stop_grace, or a second replica) can both finalize the same cycle and both
 * insert the next one. The partial unique index `tournaments_one_open_window`
 * is the cross-process lock. This helper turns the loser's unique violation
 * into a reuse of the row the winner already inserted.
 */

export const TOURNAMENT_OPEN_WINDOW_INDEX = "tournaments_one_open_window";

export type OpenCycleKey = {
  metric: string;
  type: string;
  startsAt: Date;
};

export type OpenCycleRow = {
  id: number;
  status: string;
};

export type OpenCycleDb = {
  findOpen(key: OpenCycleKey): Promise<OpenCycleRow | null>;
};

export function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "P2002") return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" && message.includes(TOURNAMENT_OPEN_WINDOW_INDEX);
}

export async function createOrReuseOpenCycle(
  db: OpenCycleDb,
  key: OpenCycleKey,
  create: () => Promise<OpenCycleRow>,
): Promise<{ row: OpenCycleRow; created: boolean }> {
  const existing = await db.findOpen(key);
  if (existing) return { row: existing, created: false };
  try {
    const row = await create();
    return { row, created: true };
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;
    const winner = await db.findOpen(key);
    if (!winner) throw err;
    return { row: winner, created: false };
  }
}
