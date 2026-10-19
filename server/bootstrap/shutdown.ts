/**
 * Graceful shutdown. A restart used to call prisma.$disconnect() right after server.close()
 * (which does not wait), so requests and cron transactions still running lost their connection
 * ("Transaction not found" on a YouTube claim and an energy-tax charge in two deploys).
 * Order now: stop crons → stop accepting → wait for in-flight HTTP and checked-out DB clients
 * (bounded) → disconnect.
 */
import type { Server, ServerResponse } from "node:http";

export type InFlightTracker = { inFlight: () => number; draining: () => boolean; startDraining: () => void };

/** Counts requests still being answered; once draining, replies ask keep-alive clients to reconnect. */
export function trackInFlightRequests(server: Server): InFlightTracker {
  const active = new Set<ServerResponse>();
  let isDraining = false;
  server.on("request", (_req, res: ServerResponse) => {
    active.add(res);
    if (isDraining) res.setHeader("Connection", "close");
    const finish = () => active.delete(res);
    res.on("finish", finish);
    res.on("close", finish);
  });
  return {
    inFlight: () => active.size,
    draining: () => isDraining,
    startDraining: () => {
      isDraining = true;
      for (const res of active) if (!res.headersSent) res.setHeader("Connection", "close");
    },
  };
}

type DrainLog = { info: (m: string, d?: Record<string, unknown>) => void; warn: (m: string, d?: Record<string, unknown>) => void };

export type DrainOptions = {
  server: Server;
  tracker: InFlightTracker;
  stopJobs: () => void;
  /** Pool clients currently checked out (queries / interactive transactions in progress). */
  dbBusy: () => number;
  disconnect: () => Promise<void>;
  log: DrainLog;
  timeoutMs: number;
  pollMs?: number;
};

export async function drainAndClose(opts: DrainOptions): Promise<{ drained: boolean; waitedMs: number }> {
  const started = Date.now();
  const pollMs = opts.pollMs ?? 100;
  opts.stopJobs();
  opts.tracker.startDraining();
  opts.server.close();
  opts.server.closeIdleConnections?.();

  const busy = () => ({ inFlight: opts.tracker.inFlight(), dbBusy: opts.dbBusy() });
  let state = busy();
  while ((state.inFlight > 0 || state.dbBusy > 0) && Date.now() - started < opts.timeoutMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    opts.server.closeIdleConnections?.();
    state = busy();
  }
  const waitedMs = Date.now() - started;
  const drained = state.inFlight === 0 && state.dbBusy === 0;
  if (drained) opts.log.info("shutdown.drained", { waitedMs });
  else opts.log.warn("SHUTDOWN_DRAIN_TIMEOUT", { waitedMs, inFlight: state.inFlight, dbBusy: state.dbBusy });

  await opts.disconnect().catch(() => undefined);
  return { drained, waitedMs };
}
