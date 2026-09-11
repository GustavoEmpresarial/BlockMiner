/**
 * HTTP helpers for feature Turnstile (youtube / faucet / shortlink).
 */
import type { Request, Response, RequestHandler } from "express";
import { z } from "zod";
import { requireSessionUser } from "../errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import {
  featureTurnstileDenyBody,
  getFeatureTurnstileStatus,
  submitFeatureTurnstilePass,
  type FeatureTurnstilePurpose,
} from "./featureTurnstileGate.js";

const log = logger.child("feature.turnstile.http");

const passBodySchema = z
  .object({
    cfTurnstileToken: z.string().trim().min(1).max(4096),
  })
  .strict();

export function featureTurnstileStatusHandler(purpose: FeatureTurnstilePurpose): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const user = requireSessionUser(req, res);
      if (!user) return;
      const raw = String(req.query.invalidate ?? "").trim().toLowerCase();
      const invalidate = raw === "1" || raw === "true" || raw === "yes";
      const status = getFeatureTurnstileStatus(purpose, user.id, { invalidate });
      res.json({ ok: true, ...status });
    } catch (e) {
      log.error("status failed", { purpose, error: String(e) });
      res.status(500).json({ ok: false, code: "error" });
    }
  };
}

export function featureTurnstilePassHandler(purpose: FeatureTurnstilePurpose): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const user = requireSessionUser(req, res);
      if (!user) return;
      const parsed = passBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(featureTurnstileDenyBody("CAPTCHA_REQUIRED"));
        return;
      }
      const result = await submitFeatureTurnstilePass(
        purpose,
        user.id,
        parsed.data.cfTurnstileToken,
        typeof req.ip === "string" ? req.ip : undefined,
      );
      if (!result.ok) {
        if (result.code === "GATE_INACTIVE") {
          res.status(400).json({ ok: false, code: "GATE_INACTIVE" });
          return;
        }
        res.status(400).json(featureTurnstileDenyBody(result.code));
        return;
      }
      res.json({ ok: true, purpose });
    } catch (e) {
      log.error("pass failed", { purpose, error: String(e) });
      res.status(500).json({ ok: false, code: "error" });
    }
  };
}
