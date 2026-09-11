import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { ALLOCATION_BPS_MAX } from "./mining.engine.js";
import * as miningService from "./mining.service.js";

/** GET /mining/cycle — public; includes miner-specific fields when authenticated. */
export async function getCycle(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id ?? null;
    const snap = await miningService.getCycleSnapshotForUser(userId);
    res.json({ ok: true, ...snap });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, message: e instanceof Error ? e.message : String(e) || "Failed" });
  }
}

/** GET /mining/reward-rate — authenticated. */
export async function getRewardRate(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const info = await miningService.getRewardRateForUser(user.id);
    res.json({ ok: true, ...info });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, message: e instanceof Error ? e.message : String(e) || "Failed" });
  }
}

/**
 * PATCH /mining/allocation — Body: { polBps: number }, 10000 = 100% POL, 0 = 100% SHIB.
 * Clamps to [0, 10000], rounds to nearest 500 (5% step).
 */
export async function updateAllocation(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const outcome = await miningService.updateUserAllocation(user.id, body.polBps);
    if (!outcome.ok) {
      if (outcome.reason === "out_of_range") {
        res.status(400).json({ ok: false, message: `polBps fora do intervalo [0, ${ALLOCATION_BPS_MAX}].` });
        return;
      }
      res.status(400).json({ ok: false, message: "polBps inválido." });
      return;
    }
    res.json({ ok: true, polBps: outcome.polBps, shibBps: outcome.shibBps });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, message: e instanceof Error ? e.message : String(e) || "Failed" });
  }
}

/**
 * PATCH /mining/payout-mode — Body: { mode: "pol" | "blk" }.
 * POL = block rewards in the simulated mining engine; BLK = time-pool cycles (exclusive).
 */
export async function updatePayoutMode(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const outcome = await miningService.updateUserPayoutMode(user.id, body.mode);
    if (!outcome.ok) {
      res.status(400).json({ ok: false, message: 'mode deve ser "pol" ou "blk".' });
      return;
    }
    res.json({ ok: true, mode: outcome.mode });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, message: e instanceof Error ? e.message : String(e) || "Failed" });
  }
}

/** POST /mining/boost — apply the 30s x1.25 boost (costs 0.35 POL). */
export async function applyBoost(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const result = await miningService.applyBoostForUser(user.id);
    res.json({ ok: result.ok, message: result.message });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, message: e instanceof Error ? e.message : String(e) || "Failed" });
  }
}

/** POST /mining/upgrade-rig — buy the next rig slot (cost 2 + (rigs-1)*0.8, +18 hashrate). */
export async function upgradeRig(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const result = await miningService.upgradeRigForUser(user.id);
    res.json({ ok: result.ok, message: result.message });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, message: e instanceof Error ? e.message : String(e) || "Failed" });
  }
}
