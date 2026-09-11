/** HTTP only. Ported from legacy powerBoost/powerBoost.controller.ts. */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import * as boostsService from "./boosts.service.js";
import { parseTaxPayCurrency } from "../../shared/taxPaymentCurrency.js";

export async function getStatus(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const status = await boostsService.getPowerBoostStatus(user.id);
  res.json({ ok: true, ...status });
}

export async function activate(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const currency = parseTaxPayCurrency(req.body?.currency);
  const result = await boostsService.activateBoost(user.id, currency);
  if (!result.ok) {
    res.status(result.code === "INSUFFICIENT_BALANCE" ? 402 : 409).json(result);
    return;
  }
  res.json(result);
}
