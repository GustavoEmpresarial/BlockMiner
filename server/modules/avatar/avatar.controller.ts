import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { slidingWindowAllow } from "../../core/http/middleware/distributedRateLimit.js";
import { logger } from "../../core/logger/index.js";
import { AvatarError } from "./avatar.errors.js";
import * as avatarService from "./avatar.service.js";
import { requestCertificate } from "./avatar.certificate.js";

const log = logger.child("AvatarController");

function requestId(req: Request): string | null {
  const v = req.headers["x-request-id"];
  return typeof v === "string" ? v : null;
}

export function sendAvatarError(res: Response, err: unknown, req: Request, op: string): void {
  if (err instanceof AvatarError) {
    if (err.retryAfterSec) res.setHeader("Retry-After", String(err.retryAfterSec));
    res.status(err.status).json({ ok: false, code: err.code, message: err.message });
    return;
  }
  log.error("AVATAR_INTERNAL_ERROR", { op, userId: req.user?.id ?? null, requestId: requestId(req), error: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ ok: false, code: "AVATAR_INTERNAL_ERROR", message: "Something went wrong. Try again." });
}

export async function getStatus(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    res.json({ ok: true, ...(await avatarService.getAvatarStatus(user.id)) });
  } catch (err) {
    sendAvatarError(res, err, req, "status");
  }
}

export async function purchaseLicense(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const { currency, expectedAmount, channel } = req.body as { currency?: unknown; expectedAmount?: unknown; channel?: unknown };
    const result = await avatarService.purchaseAvatarLicense({
      userId: user.id,
      currency,
      expectedAmount,
      channel,
      idempotencyKey: req.headers["idempotency-key"],
      requestId: requestId(req),
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    sendAvatarError(res, err, req, "purchase");
  }
}

/** Gate before multer reads the body: no license / blocked / over the hourly cap => no upload work. */
export async function uploadGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    await avatarService.assertCanUpload(user.id);
    const rl = await slidingWindowAllow({ dedupeKey: `u:${user.id}`, windowMs: 3_600_000, max: 5, redisPrefix: "avatar:upload" });
    if (!rl.ok) throw new AvatarError("AVATAR_RATE_LIMITED", { retryAfterSec: rl.retryAfterSec });
    next();
  } catch (err) {
    sendAvatarError(res, err, req, "upload_gate");
  }
}

export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: avatarService.AVATAR_MAX_UPLOAD_BYTES, files: 1, fields: 0 },
}).single("file");

export function avatarUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  avatarUpload(req, res, (err: unknown) => {
    if (!err) return next();
    const tooLarge = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
    sendAvatarError(res, new AvatarError(tooLarge ? "AVATAR_UPLOAD_TOO_LARGE" : "AVATAR_UPLOAD_INVALID"), req, "upload_parse");
  });
}

export async function uploadPhoto(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    if (!req.file?.buffer?.length) throw new AvatarError("AVATAR_UPLOAD_INVALID");
    res.json({ ok: true, ...(await avatarService.saveAvatarPhoto(user.id, req.file.buffer)) });
  } catch (err) {
    sendAvatarError(res, err, req, "upload");
  }
}

export async function deletePhoto(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    await avatarService.removeAvatarPhoto(user.id);
    res.json({ ok: true, avatarUrl: null });
  } catch (err) {
    sendAvatarError(res, err, req, "delete");
  }
}

/** Starts the AI certificate for the current license; answers at once, the client polls GET /api/avatar. */
export async function createCertificate(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const { name, language } = req.body as { name?: unknown; language?: unknown };
    const { view, job } = await requestCertificate(user.id, { name, language });
    void job;
    res.status(202).json({ ok: true, certificate: view });
  } catch (err) {
    sendAvatarError(res, err, req, "certificate");
  }
}
