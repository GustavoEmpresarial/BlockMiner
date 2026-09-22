import type { Request, Response } from "express";
import { parseClientErrorBody, parseHitBody, sanitizeString } from "./traffic.schemas.js";
import { recordHit, reportClientError } from "./traffic.service.js";

export async function postHit(req: Request, res: Response): Promise<void> {
  await recordHit(parseHitBody(req.body));
  res.json({ ok: true });
}

export async function postClientError(req: Request, res: Response): Promise<void> {
  const body = parseClientErrorBody(req.body);
  const userAgent = sanitizeString(req.headers["user-agent"], 400);
  const ip = String(req.ip ?? req.headers["x-forwarded-for"] ?? "").slice(0, 64);

  // Read optional authenticated userId if present (from authenticateTokenOptional middleware)
  const user = (req as any).user as { id?: number } | undefined;
  const userId = typeof user?.id === "number" ? user.id : null;

  const result = await reportClientError({ body, userAgent, ip, userId });
  res.json({ ok: true, dropped: result.dropped });
}
