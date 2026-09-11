/** Ported from legacy/server/modules/traffic/traffic.admin.routes.ts. */
import type { Request, Response } from "express";
import { clampDays, getByDomain, getByUtm, getDaily, getSummary } from "./traffic.service.js";

export async function adminGetTrafficSummary(req: Request, res: Response): Promise<void> {
  try {
    const days = clampDays(req.query.days);
    res.json({ ok: true, ...(await getSummary(days)) });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
}

export async function adminGetTrafficByDomain(req: Request, res: Response): Promise<void> {
  try {
    const days = clampDays(req.query.days);
    res.json({ ok: true, rows: await getByDomain(days) });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
}

export async function adminGetTrafficByUtm(req: Request, res: Response): Promise<void> {
  try {
    const days = clampDays(req.query.days);
    res.json({ ok: true, rows: await getByUtm(days) });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
}

export async function adminGetTrafficDaily(req: Request, res: Response): Promise<void> {
  try {
    const days = clampDays(req.query.days);
    res.json({ ok: true, rows: await getDaily(days) });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
}
