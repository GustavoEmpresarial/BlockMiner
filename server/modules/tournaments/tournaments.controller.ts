/**
 * HTTP read surface for tournaments.
 *
 * Every handler here used to end in a bare `catch { res.status(500) }`: the
 * exception was discarded outright — no log line, no code, no request
 * correlation. A tournament page failing in production produced a 500 and
 * absolutely nothing to investigate it with. Each catch now goes through
 * `reportError` (see core/errors/README.md) and hands the caller back the
 * `error_id`, so a player quoting it is enough for support to find the exact
 * occurrence.
 *
 * Reporting must never change the outcome of the request: `reportError` does
 * not throw, and the response shape on success is untouched.
 */
import type { Request, Response } from "express";
import { reportError } from "../../core/errors/index.js";
import { TOURNAMENT_ERROR } from "./tournaments.errors.js";
import {
  listActiveTournaments,
  getTournamentWithLeaderboard,
  getUserTournamentHistory,
  getMyTournamentScoreBreakdown,
} from "./tournaments.service.js";

type AuthedRequest = Request & { user?: { id: number } };

/**
 * Reports the failure and answers with the occurrence id.
 *
 * `error_id` is deliberately the ONLY detail that crosses the boundary: the
 * message stays generic so an internal failure never leaks a stack, a Prisma
 * error or a table name to an unauthenticated caller.
 */
function failed(
  res: Response,
  req: Request,
  code: string,
  operation: string,
  error: unknown,
  context: Record<string, unknown>,
  message: string,
): void {
  const { errorId } = reportError({
    code,
    category: "UNKNOWN",
    severity: "ERROR",
    // A read endpoint being down breaks a feature for whoever hits it, but
    // nothing is lost or corrupted — that is MEDIUM, not HIGH.
    impact: "MEDIUM",
    module: "tournaments",
    operation,
    error,
    context,
    req,
  });
  res.status(500).json({ ok: false, message, errorId });
}

/**
 * Route params are strings from the network. `parseInt` alone accepts "-5" and
 * "12abc" (→ 12), both of which used to reach Prisma and come back as a 404.
 * A tournament id is a positive integer or it is a bad request.
 */
function parseTournamentId(raw: unknown): number | null {
  const id = Number(String(raw ?? "").trim());
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function listTournaments(req: Request, res: Response): Promise<void> {
  try {
    const tournaments = await listActiveTournaments();
    res.json({ ok: true, tournaments });
  } catch (err) {
    failed(
      res,
      req,
      TOURNAMENT_ERROR.LIST_FAILED,
      "listTournaments",
      err,
      {},
      "Failed to load tournaments",
    );
  }
}

export async function getTournament(req: Request, res: Response): Promise<void> {
  const id = parseTournamentId(req.params.id);
  if (id === null) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  const userId = (req as AuthedRequest).user?.id;
  try {
    const data = await getTournamentWithLeaderboard(id, userId);
    if (!data) {
      res.status(404).json({ ok: false, message: "Not found" });
      return;
    }
    res.json({ ok: true, ...data });
  } catch (err) {
    failed(
      res,
      req,
      TOURNAMENT_ERROR.DETAIL_FAILED,
      "getTournament",
      err,
      { tournamentId: id, userId },
      "Failed to load tournament",
    );
  }
}

export async function myRank(req: Request, res: Response): Promise<void> {
  const id = parseTournamentId(req.params.id);
  // requireAuth runs in front of this route, so `user` is always set in
  // practice. The defensive check stays so a middleware reorder cannot
  // silently serve another player's rank.
  // if the middleware is ever reordered, this must answer 401, not crash on
  // a non-null assertion and surface as an opaque 500.
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
    return;
  }
  if (id === null) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  try {
    const data = await getTournamentWithLeaderboard(id, userId);
    if (!data) {
      res.status(404).json({ ok: false, message: "Not found" });
      return;
    }
    res.json({ ok: true, myEntry: data.myEntry, myRankLive: data.myRankLive });
  } catch (err) {
    failed(
      res,
      req,
      TOURNAMENT_ERROR.MY_RANK_FAILED,
      "myRank",
      err,
      { tournamentId: id, userId },
      "Failed",
    );
  }
}

export async function myHistory(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
    return;
  }
  try {
    const history = await getUserTournamentHistory(userId);
    res.json({ ok: true, history });
  } catch (err) {
    failed(res, req, TOURNAMENT_ERROR.MY_HISTORY_FAILED, "myHistory", err, { userId }, "Failed");
  }
}

export async function myScoreBreakdown(req: Request, res: Response): Promise<void> {
  const id = parseTournamentId(req.params.id);
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
    return;
  }
  if (id === null) {
    res.status(400).json({ ok: false, message: "Invalid request" });
    return;
  }
  try {
    const data = await getMyTournamentScoreBreakdown(id, userId);
    if (!data) {
      res.status(404).json({ ok: false, message: "Not found or metric has no score breakdown" });
      return;
    }
    res.json({ ok: true, ...data });
  } catch (err) {
    failed(
      res,
      req,
      TOURNAMENT_ERROR.MY_SCORE_BREAKDOWN_FAILED,
      "myScoreBreakdown",
      err,
      { tournamentId: id, userId },
      "Failed",
    );
  }
}
