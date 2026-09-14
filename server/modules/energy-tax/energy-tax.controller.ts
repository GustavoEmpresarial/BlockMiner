/** HTTP only. Ported from legacy energy-tax/energyTax.controller.ts. */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import * as energyTaxService from "./energy-tax.service.js";
import {
  EnergyTaxAlreadyPaid,
  EnergyTaxInsufficientBalance,
  EnergyTaxNoRewards,
  EnergyTaxNotStarted,
} from "./energy-tax.errors.js";
import { logger } from "../../core/logger/index.js";
import { parseTaxPayCurrency } from "../../shared/taxPaymentCurrency.js";
import {
  resolveCriticalMutation,
  finalizeCriticalMutationSuccess,
  cancelCriticalMutation,
} from "../../core/http/middleware/idempotency.js";

const log = logger.child("energy-tax.controller");

// In-memory per-user cache. computeWeekSummary fires ~40-60 queries (aggregates
// rewards per day over large tables). Result barely changes second to second, so
// serve from a short-TTL cache and invalidate on payment.
const SUMMARY_TTL_MS = 45_000;
const summaryCache = new Map<number, { at: number; data: Awaited<ReturnType<typeof energyTaxService.computeWeekSummary>> }>();

function invalidateSummary(userId: number): void {
  summaryCache.delete(userId);
}

export async function getSummary(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const now = Date.now();
    const cached = summaryCache.get(user.id);
    if (cached && now - cached.at < SUMMARY_TTL_MS) {
      res.json({ ok: true, ...cached.data });
      return;
    }
    const summary = await energyTaxService.computeWeekSummary(user.id);
    summaryCache.set(user.id, { at: now, data: summary });
    if (summaryCache.size > 5000) {
      for (const [k, v] of Array.from(summaryCache.entries())) {
        if (now - v.at >= SUMMARY_TTL_MS) summaryCache.delete(k);
      }
    }
    res.json({ ok: true, ...summary });
  } catch (err) {
    log.error("[energy-tax summary]", { error: String(err) });
    res.status(500).json({ ok: false, message: "Erro ao carregar resumo." });
  }
}

export async function postPayDaily(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const idem = await resolveCriticalMutation(req, res);
  if (!idem) return;
  try {
    const currency = parseTaxPayCurrency(req.body?.currency);
    const charge = await energyTaxService.payDailyTax(user.id, currency);
    invalidateSummary(user.id);
    const payload = { ok: true, charge, currency };
    await finalizeCriticalMutationSuccess(idem.lease, { requestHash: idem.ci.requestHash, responseJson: payload });
    res.json(payload);
  } catch (err) {
    await cancelCriticalMutation(idem.lease);
    if (err instanceof EnergyTaxNotStarted) {
      res.status(403).json({ ok: false, code: "NOT_STARTED", message: err.message, startsAt: err.startsAt.toISOString() });
      return;
    }
    if (err instanceof EnergyTaxAlreadyPaid) {
      res.status(409).json({ ok: false, code: "ALREADY_PAID", message: err.message });
      return;
    }
    if (err instanceof EnergyTaxNoRewards) {
      res.status(400).json({ ok: false, code: "NO_REWARDS", message: err.message });
      return;
    }
    if (err instanceof EnergyTaxInsufficientBalance) {
      res.status(400).json({
        ok: false,
        code: "INSUFFICIENT_BALANCE",
        message: err.message,
        required: err.required,
        available: err.available,
        currency: err.currency,
      });
      return;
    }
    log.error("[energy-tax pay-daily]", { error: String(err) });
    res.status(500).json({ ok: false, message: "Erro ao processar pagamento." });
  }
}
