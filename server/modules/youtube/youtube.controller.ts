/** Ported from legacy/server/modules/youtube/youtube.controller.ts. */
import type { Request, Response } from "express";
import { logger } from "../../core/logger/index.js";
import {
  assertFeatureTurnstile,
  featureTurnstileDenyBody,
} from "../../shared/security/featureTurnstileGate.js";
import * as youtubeService from "./youtube.service.js";

const log = logger.child("youtube.controller");

export async function getStatus(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const result = await youtubeService.getStatusForUser(req.user.id);
    res.json(result);
  } catch (err: unknown) {
    log.error("YT getStatus error", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Error fetching status." });
  }
}

export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const result = await youtubeService.getStatsForUser(req.user.id);
    res.json(result);
  } catch (err: unknown) {
    log.error("YT getStats error", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Error fetching stats." });
  }
}

export async function claimReward(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const { videoId, cfTurnstileToken } = req.body as {
      videoId?: string;
      cfTurnstileToken?: unknown;
    };
    if (!videoId) {
      res.status(400).json({ ok: false, message: "Missing videoId." });
      return;
    }

    const gate = await assertFeatureTurnstile(
      "youtube",
      req.user.id,
      cfTurnstileToken,
      typeof req.ip === "string" ? req.ip : undefined,
    );
    if (!gate.ok) {
      res.status(400).json(featureTurnstileDenyBody(gate.code));
      return;
    }

    const result = await youtubeService.claimForUser(req.user.id, videoId);
    if (!result.ok) {
      const body: Record<string, unknown> = { ok: false, message: result.message };
      if (result.retryAfterMs != null) body.retryAfterMs = result.retryAfterMs;
      res.status(result.status).json(body);
      return;
    }
    res.json({ ok: true, message: result.message, rewardGh: result.rewardGh });
  } catch (err: unknown) {
    log.error("YT claimReward error", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Error claiming reward." });
  }
}
