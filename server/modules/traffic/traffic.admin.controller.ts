/**
 * Controller for Admin Traffic & Origin Analytics.
 */
import type { Request, Response } from "express";
import { logger } from "../../core/logger/index.js";
import { adminTrafficQuerySchema } from "./traffic.admin.schemas.js";
import { getByDomain, getByUtm, getDaily, getSummary } from "./traffic.service.js";

const log = logger.child("traffic.admin.controller");

export async function adminGetTrafficSummary(req: Request, res: Response): Promise<void> {
  const parsed = adminTrafficQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message || "Parâmetros inválidos.",
    });
    return;
  }

  try {
    const summary = await getSummary(parsed.data.days);
    res.json({ ok: true, ...summary });
  } catch (err) {
    log.error("Failed to query traffic summary", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, code: "TRAFFIC_QUERY_ERROR", message: "Erro ao consultar resumo de tráfego." });
  }
}

export async function adminGetTrafficByDomain(req: Request, res: Response): Promise<void> {
  const parsed = adminTrafficQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message || "Parâmetros inválidos.",
    });
    return;
  }

  try {
    const rows = await getByDomain(parsed.data.days);
    res.json({ ok: true, rows });
  } catch (err) {
    log.error("Failed to query traffic by domain", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, code: "TRAFFIC_QUERY_ERROR", message: "Erro ao consultar tráfego por domínio." });
  }
}

export async function adminGetTrafficByUtm(req: Request, res: Response): Promise<void> {
  const parsed = adminTrafficQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message || "Parâmetros inválidos.",
    });
    return;
  }

  try {
    const rows = await getByUtm(parsed.data.days);
    res.json({ ok: true, rows });
  } catch (err) {
    log.error("Failed to query traffic by utm", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, code: "TRAFFIC_QUERY_ERROR", message: "Erro ao consultar tráfego por UTM." });
  }
}

export async function adminGetTrafficDaily(req: Request, res: Response): Promise<void> {
  const parsed = adminTrafficQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message || "Parâmetros inválidos.",
    });
    return;
  }

  try {
    const rows = await getDaily(parsed.data.days);
    res.json({ ok: true, rows });
  } catch (err) {
    log.error("Failed to query daily traffic", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, code: "TRAFFIC_QUERY_ERROR", message: "Erro ao consultar tráfego diário." });
  }
}
