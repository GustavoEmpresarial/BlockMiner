import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import * as swapService from "./swap.service.js";

export async function getBalances(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const { balances, prices } = await swapService.getBalancesForUser(user.id);
    res.json({ ok: true, balances, prices });
  } catch {
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

export async function executeSwap(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const { fromAsset, toAsset, amount } = req.body as { fromAsset?: string; toAsset?: string; amount?: unknown };
    const amountNum = Number(amount);
    if (!swapService.isValidSwapPair(fromAsset, toAsset)) {
      res.status(400).json({
        ok: false,
        code: "invalid_pair",
        message:
          fromAsset === "BLK"
            ? "BLK cannot be swapped to withdrawable currencies"
            : `Swap ${fromAsset}→${toAsset} not supported (only POL→BLK and SHIB→BLK)`,
      });
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      res.status(400).json({ ok: false, message: "Invalid amount" });
      return;
    }
    const { rate, output } = await swapService.executeSwapForUser(user.id, fromAsset as string, toAsset as string, amountNum);
    res.json({ ok: true, rate, output });
  } catch (e: unknown) {
    res.status(400).json({ ok: false, message: e instanceof Error ? e.message : String(e) });
  }
}
