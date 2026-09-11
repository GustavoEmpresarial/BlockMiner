/**
 * Auto Mining GPU v2 controller. Ported 1:1 from
 * legacy/server/modules/auto-mining/auto-mining.v2.controller.ts, adapted to the
 * `{ ok:true,... } | { ok:false, message, code }` response contract.
 *
 * Real bug fixed 12/08/2026 (PROGRESSO.txt item 74): syncEngineForUser() (live mining engine
 * hash-rate sync) used to be a documented, deliberate omission ("mining engine wiring is Fase 3
 * in progress") — true when written, stale since the engine was finished. Every claimed grant
 * (claimNormal/claimTurbo) updated `auto_mining_v2_power_grants` in the DB but never pushed the
 * new total into the live in-memory engine, so the extra hashrate never counted toward the next
 * block until some OTHER unrelated action happened to resync it. mini-pass mission hook
 * (notifyMiniPassAutoMiningTurbo) remains a separate, still-open gap — not touched here.
 */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import {
  assertFeatureTurnstile,
  featureTurnstileDenyBody,
} from "../../shared/security/featureTurnstileGate.js";
import { syncUserBaseHashRate } from "../mining/index.js";
import {
  startSession,
  stopSession,
  pauseSession,
  resumeSession,
  getStatusPayload,
  claimNormal,
  getOrCreateBannerImpression,
  registerBannerClick,
  claimTurbo,
} from "./auto-mining.v2.service.js";

const log = logger.child("AutoMiningV2Controller");

/** Recomputes + pushes the fresh total into the live engine (mining/index.ts, see its header
 *  comment for why this single call now covers every acquisition module). */
async function syncEngineForUser(userId: number): Promise<void> {
  try {
    await syncUserBaseHashRate(userId);
  } catch (err: unknown) {
    log.warn(`auto-mining hashrate sync failed userId=${userId}`, { error: err instanceof Error ? err.message : String(err) });
  }
}

type ServiceError = Error & { code?: string };

/** Expected states of a polling client, not failures. Answered with HTTP 200 so a 1s poll
 *  does not flood the console (and the error logs) with 400s. */
const BENIGN_CLAIM_CODES = new Set(["CLAIM_NOT_DUE", "PRESENCE_INSUFFICIENT", "PRESENCE_STALE", "SESSION_PAUSED"]);

function sendError(res: Response, err: unknown, defaultStatus = 400) {
  const e = err as ServiceError & { retryAfterMs?: number; secondsShort?: number };
  const code = e.code || "SERVER_ERROR";
  if (BENIGN_CLAIM_CODES.has(code)) {
    res.json({
      ok: false,
      code,
      message: e.message || "Not ready yet",
      ...(e.retryAfterMs != null ? { retryAfterMs: e.retryAfterMs } : {}),
      ...(e.secondsShort != null ? { secondsShort: e.secondsShort } : {}),
    });
    return;
  }
  const status =
    code === "SCHEMA_UNAVAILABLE" ? 503
    : code === "NOT_FOUND"        ? 404
    : code === "CONCURRENT_CLAIM" ? 409
    : code === "INVALID_MODE"     ? 400
    : defaultStatus;
  res.status(status).json({ ok: false, message: e.message || "Request failed", code });
}

/** POST /v2/session/start */
export async function postStartSession(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const body = req.body as { mode?: string; cfTurnstileToken?: unknown };
    const gate = await assertFeatureTurnstile(
      "automining",
      user.id,
      body?.cfTurnstileToken,
      typeof req.ip === "string" ? req.ip : undefined,
    );
    if (!gate.ok) {
      res.status(400).json(featureTurnstileDenyBody(gate.code));
      return;
    }
    const mode = String(body?.mode || "").toUpperCase();
    log.info("postStartSession_entered", { userId: user.id, mode });
    await startSession(user.id, mode);
    const payload = await getStatusPayload(user.id);
    res.json({ ok: true, success: true, ...payload });
  } catch (err: unknown) {
    log.error("postStartSession", { message: err instanceof Error ? err.message : String(err) });
    sendError(res, err);
  }
}

/** POST /v2/session/stop */
export async function postStopSession(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    await stopSession(user.id);
    const payload = await getStatusPayload(user.id);
    res.json({ ok: true, success: true, ...payload });
  } catch (err: unknown) {
    log.error("postStopSession", { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Server error", code: "SERVER_ERROR" });
  }
}

/** POST /v2/session/pause — user left the page or the tab. */
export async function postPauseSession(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    await pauseSession(user.id);
    const payload = await getStatusPayload(user.id);
    res.json({ ok: true, success: true, ...payload });
  } catch (err: unknown) {
    log.error("postPauseSession", { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Server error", code: "SERVER_ERROR" });
  }
}

/** POST /v2/session/resume — user came back and explicitly resumed. */
export async function postResumeSession(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    await resumeSession(user.id);
    const payload = await getStatusPayload(user.id);
    res.json({ ok: true, success: true, ...payload });
  } catch (err: unknown) {
    log.error("postResumeSession", { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Server error", code: "SERVER_ERROR" });
  }
}

/** GET /v2/status */
export async function getV2Status(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const payload = await getStatusPayload(user.id);
    res.json({ ok: true, success: true, ...payload });
  } catch (err: unknown) {
    log.error("getV2Status", { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Server error", code: "SERVER_ERROR" });
  }
}

/** POST /v2/claim/normal */
export async function postClaimNormal(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const result = await claimNormal(user.id);
    await syncEngineForUser(user.id);
    const payload = await getStatusPayload(user.id);
    res.json({
      ok: true,
      success: true,
      grant: {
        id: result.grant.id,
        hashRate: result.grant.hashRate,
        earnedAt: result.grant.earnedAt.toISOString(),
        expiresAt: result.grant.expiresAt.toISOString(),
        mode: result.grant.mode,
      },
      nextClaimAt: result.nextClaimAt.toISOString(),
      ...payload,
    });
  } catch (err: unknown) {
    sendError(res, err);
  }
}

/** GET /v2/banner */
export async function getTurboBanner(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const { impression, reused } = await getOrCreateBannerImpression(user.id);
    res.json({
      ok: true,
      reused,
      impression: {
        id: impression.id,
        bannerKey: impression.bannerKey,
        targetUrl: impression.targetUrl,
        title: impression.title,
        imageUrl: impression.imageUrl,
        createdAt: impression.createdAt.toISOString(),
      },
    });
  } catch (err: unknown) {
    sendError(res, err);
  }
}

/** POST /v2/banner/click */
export async function postBannerClick(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const impressionId = String((req.body as { impressionId?: string })?.impressionId || "");
    if (!impressionId) {
      res.status(400).json({ ok: false, message: "impressionId is required", code: "VALIDATION" });
      return;
    }
    const row = await registerBannerClick(user.id, impressionId);
    res.json({ ok: true, clickedAt: row.clickedAt?.toISOString() || null });
  } catch (err: unknown) {
    sendError(res, err);
  }
}

/** POST /v2/claim/turbo */
export async function postClaimTurbo(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const impressionId = String((req.body as { impressionId?: string })?.impressionId || "");
    if (!impressionId) {
      res.status(400).json({ ok: false, message: "impressionId is required", code: "VALIDATION" });
      return;
    }
    const result = await claimTurbo(user.id, impressionId);
    await syncEngineForUser(user.id);
    const payload = await getStatusPayload(user.id);
    res.json({
      ok: true,
      grant: {
        id: result.grant.id,
        hashRate: result.grant.hashRate,
        earnedAt: result.grant.earnedAt.toISOString(),
        expiresAt: result.grant.expiresAt.toISOString(),
        mode: result.grant.mode,
      },
      nextClaimAt: result.nextClaimAt.toISOString(),
      ...payload,
    });
  } catch (err: unknown) {
    sendError(res, err);
  }
}
