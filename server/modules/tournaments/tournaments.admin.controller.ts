/**
 * Admin HTTP surface for tournaments.
 *
 * Failures go through `reportError` and return a generic message + `errorId`.
 * Never send `String(err)` / Prisma text to the client.
 */
import type { Request, Response } from "express";
import { reportError } from "../../core/errors/index.js";
import {
  adminListTournaments,
  adminCreateTournament,
  adminUpdateTournament,
  adminCancelTournament,
  adminGetEntries,
  finalizeTournament,
  adminTournamentScoreAudit,
  adminTournamentScoreAuditUser,
  getTypeDisplayOrder,
  setTypeDisplayOrder,
} from "./tournaments.service.js";
import { getEngineStats } from "./tournaments.metrics.js";
import { listRecentDriftAlerts } from "./tournaments.offerwall-drift.js";
import prisma from "../../core/database/prisma.js";
import { isTournamentValidMetric } from "./tournaments.valid-metrics.js";
import { TOURNAMENT_ERROR } from "./tournaments.errors.js";

const MAX_TOURNAMENT_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_TYPE_ORDER_LENGTH = 20;
const MAX_PRIZE_NUMERIC = 1_000_000_000;

/** Named defaults for admin entry pagination (no magic page/limit). */
export const TOURNAMENT_ADMIN_ENTRIES_DEFAULT_PAGE = 1;
export const TOURNAMENT_ADMIN_ENTRIES_DEFAULT_LIMIT = 50;
export const TOURNAMENT_ADMIN_ENTRIES_MAX_LIMIT = 200;

function validatePrizeAmount(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== "number") return `${label} must be a number`;
  if (!Number.isFinite(value)) return `${label} is not a valid number`;
  if (value < 0) return `${label} must not be negative`;
  if (value > MAX_PRIZE_NUMERIC) return `${label} exceeds maximum`;
  return null;
}

function validatePrizes(prizes: unknown): string | null {
  if (!Array.isArray(prizes)) return null;
  for (const p of prizes) {
    if (typeof p !== "object" || p === null) return "Invalid prize entry";
    const r = p as Record<string, unknown>;
    if (typeof r.rankFrom !== "number" || typeof r.rankTo !== "number") return "Invalid prize rank range";
    if (r.rankFrom < 1 || r.rankTo < r.rankFrom) return "Invalid prize rank range";

    const err =
      validatePrizeAmount(r.polAmount, "polAmount") ??
      validatePrizeAmount(r.blkAmount, "blkAmount") ??
      validatePrizeAmount(r.boostHashRate, "boostHashRate") ??
      validatePrizeAmount(r.boostHours, "boostHours") ??
      validatePrizeAmount(r.minerCount, "minerCount");
    if (err) return err;

    if (r.minerId != null && r.minerId !== undefined) {
      if (typeof r.minerId !== "number" || !Number.isFinite(r.minerId) || r.minerId < 1) {
        return "Invalid minerId";
      }
    }
  }
  return null;
}

function parsePositiveInt(raw: unknown): number | null {
  const n = Number(String(raw ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Clamp page/limit so Prisma never sees a negative skip. */
export function clampAdminEntriesPagination(
  pageRaw: unknown,
  limitRaw: unknown,
): { page: number; limit: number } {
  const pageParsed = parseInt(String(pageRaw ?? TOURNAMENT_ADMIN_ENTRIES_DEFAULT_PAGE), 10);
  const limitParsed = parseInt(String(limitRaw ?? TOURNAMENT_ADMIN_ENTRIES_DEFAULT_LIMIT), 10);
  const page =
    Number.isFinite(pageParsed) && pageParsed >= 1
      ? pageParsed
      : TOURNAMENT_ADMIN_ENTRIES_DEFAULT_PAGE;
  const limitUnclamped =
    Number.isFinite(limitParsed) && limitParsed >= 1
      ? limitParsed
      : TOURNAMENT_ADMIN_ENTRIES_DEFAULT_LIMIT;
  const limit = Math.min(TOURNAMENT_ADMIN_ENTRIES_MAX_LIMIT, limitUnclamped);
  return { page, limit };
}

function failed(
  res: Response,
  req: Request,
  operation: string,
  error: unknown,
  context: Record<string, unknown>,
  status = 500,
  code: string = TOURNAMENT_ERROR.ADMIN_OPERATION_FAILED,
): void {
  const { errorId } = reportError({
    code,
    category: "UNKNOWN",
    severity: "ERROR",
    impact: "MEDIUM",
    module: "tournaments.admin",
    operation,
    error,
    context,
    req,
  });
  res.status(status).json({ ok: false, message: "Tournament admin operation failed", errorId });
}

function businessFailed(
  res: Response,
  req: Request,
  operation: string,
  error: unknown,
  context: Record<string, unknown>,
): void {
  const errObj = error as { code?: string; status?: number; message?: string } | null;
  const code =
    typeof errObj?.code === "string" && errObj.code.startsWith("TOURNAMENT_")
      ? errObj.code
      : TOURNAMENT_ERROR.ADMIN_OPERATION_FAILED;
  const status = typeof errObj?.status === "number" ? errObj.status : 400;
  const { errorId } = reportError({
    code,
    category: "BUSINESS",
    severity: "WARNING",
    impact: "LOW",
    module: "tournaments.admin",
    operation,
    error,
    context,
    req,
  });
  const message =
    typeof errObj?.message === "string" && errObj.message && !/prisma|relation|column/i.test(errObj.message)
      ? errObj.message
      : "Tournament admin operation failed";
  res.status(status).json({ ok: false, message, errorId, code });
}

export async function listAll(req: Request, res: Response): Promise<void> {
  try {
    const tournaments = await adminListTournaments();
    res.json({ ok: true, tournaments });
  } catch (err) {
    failed(res, req, "listAll", err, {});
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  const { name, description, type, metric, startsAt, endsAt, prizes, recurring } = req.body as {
    name: string;
    description?: string;
    type: "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
    metric: string;
    startsAt: string;
    endsAt: string;
    recurring?: boolean;
    prizes: Array<Record<string, unknown>>;
  };

  if (!name || !type || !metric || !startsAt || !endsAt) {
    res.status(400).json({ ok: false, message: "Missing required fields" });
    return;
  }

  const VALID_TYPES = ["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"];
  if (!VALID_TYPES.includes(type) || !isTournamentValidMetric(metric)) {
    res.status(400).json({ ok: false, message: "Invalid type or metric" });
    return;
  }

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    res.status(400).json({ ok: false, message: "Invalid dates" });
    return;
  }

  if (end.getTime() - start.getTime() > MAX_TOURNAMENT_DURATION_MS) {
    res.status(400).json({ ok: false, message: "Tournament duration exceeds 90 days maximum" });
    return;
  }

  if (!Array.isArray(prizes)) {
    res.status(400).json({ ok: false, message: "prizes must be an array" });
    return;
  }

  const prizeError = validatePrizes(prizes);
  if (prizeError) {
    res.status(400).json({ ok: false, message: prizeError });
    return;
  }

  try {
    const tournament = await adminCreateTournament({
      name,
      description,
      type,
      metric,
      startsAt: start,
      endsAt: end,
      recurring: Boolean(recurring),
      prizes: prizes as Parameters<typeof adminCreateTournament>[0]["prizes"],
    });
    res.json({ ok: true, tournament });
  } catch (err) {
    businessFailed(res, req, "create", err, { name, type, metric });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const VALID_TYPES = ["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"];

  const patch: Parameters<typeof adminUpdateTournament>[1] = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.description === "string" || body.description === null) {
    patch.description = body.description as string | null;
  }
  if (typeof body.type === "string") {
    if (!VALID_TYPES.includes(body.type)) {
      res.status(400).json({ ok: false, message: "Invalid type" });
      return;
    }
    patch.type = body.type as never;
  }
  if (typeof body.metric === "string") {
    if (!isTournamentValidMetric(body.metric)) {
      res.status(400).json({ ok: false, message: "Invalid metric" });
      return;
    }
    patch.metric = body.metric;
  }
  if (typeof body.recurring === "boolean") patch.recurring = body.recurring;
  if (typeof body.startsAt === "string") {
    const d = new Date(body.startsAt);
    if (isNaN(d.getTime())) {
      res.status(400).json({ ok: false, message: "Invalid startsAt" });
      return;
    }
    patch.startsAt = d;
  }
  if (typeof body.endsAt === "string") {
    const d = new Date(body.endsAt);
    if (isNaN(d.getTime())) {
      res.status(400).json({ ok: false, message: "Invalid endsAt" });
      return;
    }
    patch.endsAt = d;
  }
  if (patch.startsAt && patch.endsAt && patch.endsAt <= patch.startsAt) {
    res.status(400).json({ ok: false, message: "endsAt must be after startsAt" });
    return;
  }
  if (Array.isArray(body.prizes)) {
    const prizeError = validatePrizes(body.prizes);
    if (prizeError) {
      res.status(400).json({ ok: false, message: prizeError });
      return;
    }
    patch.prizes = body.prizes as never;
  }

  const finalStart = patch.startsAt ?? (body.startsAt ? new Date(body.startsAt as string) : null);
  const finalEnd = patch.endsAt ?? (body.endsAt ? new Date(body.endsAt as string) : null);
  if (finalStart && finalEnd && finalEnd.getTime() - finalStart.getTime() > MAX_TOURNAMENT_DURATION_MS) {
    res.status(400).json({ ok: false, message: "Tournament duration exceeds 90 days maximum" });
    return;
  }

  try {
    const tournament = await adminUpdateTournament(id, patch);
    res.json({ ok: true, tournament });
  } catch (err) {
    businessFailed(res, req, "update", err, { tournamentId: id });
  }
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  try {
    const tournament = await adminCancelTournament(id);
    res.json({ ok: true, tournament });
  } catch (err) {
    businessFailed(res, req, "cancel", err, { tournamentId: id });
  }
}

export async function finalize(req: Request, res: Response): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  try {
    const result = await finalizeTournament(id);
    res.json({ ok: true, ...result });
  } catch (err) {
    failed(res, req, "finalize", err, { tournamentId: id }, 400);
  }
}

export async function getDisplayOrder(req: Request, res: Response): Promise<void> {
  try {
    const typeOrder = await getTypeDisplayOrder();
    res.json({ ok: true, typeOrder });
  } catch (err) {
    failed(res, req, "getDisplayOrder", err, {});
  }
}

export async function updateDisplayOrder(req: Request, res: Response): Promise<void> {
  const body = req.body as { typeOrder?: unknown };
  if (
    !Array.isArray(body.typeOrder) ||
    body.typeOrder.length > MAX_TYPE_ORDER_LENGTH ||
    !body.typeOrder.every((t) => typeof t === "string")
  ) {
    res.status(400).json({ ok: false, message: "typeOrder must be string[] with at most 20 entries" });
    return;
  }
  try {
    const typeOrder = await setTypeDisplayOrder(body.typeOrder);
    res.json({ ok: true, typeOrder });
  } catch (err) {
    failed(res, req, "updateDisplayOrder", err, {});
  }
}

export async function entries(req: Request, res: Response): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  const { page, limit } = clampAdminEntriesPagination(req.query.page, req.query.limit);
  try {
    const data = await adminGetEntries(id, page, limit);
    res.json({ ok: true, ...data });
  } catch (err) {
    failed(res, req, "entries", err, { tournamentId: id, page, limit });
  }
}

export async function scoreAudit(req: Request, res: Response): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  try {
    const data = await adminTournamentScoreAudit(id);
    if (!data) {
      res.status(404).json({ ok: false, message: "Not found" });
      return;
    }
    res.json({ ok: true, ...data });
  } catch (err) {
    businessFailed(res, req, "scoreAudit", err, { tournamentId: id });
  }
}

export async function scoreAuditUser(req: Request, res: Response): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  const userId = parsePositiveInt(req.params.userId);
  if (!id || !userId) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  try {
    const data = await adminTournamentScoreAuditUser(id, userId);
    if (!data) {
      res.status(404).json({ ok: false, message: "Not found" });
      return;
    }
    res.json({ ok: true, ...data });
  } catch (err) {
    businessFailed(res, req, "scoreAuditUser", err, { tournamentId: id, userId });
  }
}

export async function engineStats(req: Request, res: Response): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  try {
    const stats = await getEngineStats(id);
    if (!stats) {
      res.status(404).json({ ok: false, message: "Not found" });
      return;
    }
    res.json({ ok: true, engineStats: stats });
  } catch (err) {
    failed(res, req, "engineStats", err, { tournamentId: id });
  }
}

export async function driftAlerts(req: Request, res: Response): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
  try {
    const alerts = await listRecentDriftAlerts(id, limit);
    res.json({ ok: true, alerts });
  } catch (err) {
    failed(res, req, "driftAlerts", err, { tournamentId: id, limit });
  }
}

export async function offerwallMigration(req: Request, res: Response): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  try {
    const db = prisma as typeof prisma & {
      tournamentOfferwallMigration?: { findUnique: (args: unknown) => Promise<unknown> };
      tournamentOfferwallMigrationGlobal?: { findUnique: (args: unknown) => Promise<unknown> };
    };
    const [migration, globalState] = await Promise.all([
      db.tournamentOfferwallMigration?.findUnique({ where: { tournamentId: id } }) ?? null,
      db.tournamentOfferwallMigrationGlobal?.findUnique({ where: { id: 1 } }) ?? null,
    ]);
    res.json({ ok: true, migration, globalBackfill: globalState });
  } catch (err) {
    failed(res, req, "offerwallMigration", err, { tournamentId: id });
  }
}
