/**
 * Ported from legacy/server/modules/games/gamesPower.controller.ts.
 * GET /api/games/active-powers — read-only: sums non-expired UserPowerGame rows for
 * the authenticated user, plus active rack machine hash for UI contrast (permanent
 * vs temporary hashrate).
 */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import * as gamesPowerRepo from "./games.power.repository.js";

const log = logger.child("games.power.controller");

export async function getActiveGamePowers(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const now = new Date();

    const [powerRows, machineAgg] = await Promise.all([
      gamesPowerRepo.listActiveGamePowers(user.id, now),
      gamesPowerRepo.aggregateActiveMinerHashRate(user.id),
    ]);

    let totalHashRate = 0;
    const byGame = new Map<number, { gameId: number; slug: string; name: string; hashRate: number }>();

    for (const row of powerRows) {
      const h = Number(row.hashRate || 0);
      totalHashRate += h;
      const key = row.gameId;
      if (!byGame.has(key)) {
        byGame.set(key, { gameId: key, slug: row.game?.slug ?? "", name: row.game?.name ?? "", hashRate: 0 });
      }
      const entry = byGame.get(key);
      if (entry) entry.hashRate += h;
    }

    const breakdown = Array.from(byGame.values()).sort((a, b) => b.hashRate - a.hashRate);
    const machineHashRate = Number(machineAgg._sum.hashRate || 0);

    res.json({ ok: true, totalHashRate, machineHashRate, breakdown });
  } catch (err: unknown) {
    log.error("getActiveGamePowers failed", { error: String(err) });
    res.status(500).json({ ok: false, message: "Unable to load game powers." });
  }
}
