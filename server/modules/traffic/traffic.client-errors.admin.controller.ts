/**
 * Ported from legacy/server/modules/traffic/clientErrors.admin.routes.ts.
 *
 * Architectural call: clientErrors is client-side crash/error reporting (ErrorBoundary
 * crashes + handled API failures), not acquisition/attribution analytics — a genuinely
 * different concern from the rest of traffic/. It is folded into this module anyway
 * (as `traffic.client-errors.*` files, not its own top-level module) because: (1) it is
 * tiny — one ingestion endpoint plus two admin endpoints, well under the threshold where
 * ARQUITETURA.md's "módulos pequenos" guidance would justify a new module; (2) its only
 * write path (`reportClientError` in traffic.service.ts) is physically the second half of
 * traffic.routes.ts in the legacy code, sharing the public router, the sanitize() helper,
 * and the "public best-effort telemetry POST" shape with the page-view hit endpoint; a
 * standalone module would immediately need to import back into traffic/ for that shared
 * ingestion surface. Kept as clearly-named separate files (not merged into
 * traffic.service.ts's other functions) so the boundary stays visible.
 */
import type { Request, Response } from "express";
import { logger } from "../../core/logger/index.js";
import { clearClientErrorReports, listClientErrorReports } from "./traffic.service.js";

const log = logger.child("traffic.client-errors.admin");

export async function adminListClientErrors(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
    const items = await listClientErrorReports(limit);
    res.json({ ok: true, items });
  } catch (err) {
    log.error("[admin client-errors error]", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Erro ao carregar reports." });
  }
}

export async function adminClearClientErrors(_req: Request, res: Response): Promise<void> {
  try {
    const deleted = await clearClientErrorReports();
    res.json({ ok: true, deleted });
  } catch (err) {
    log.error("[admin client-errors delete error]", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Erro ao limpar reports." });
  }
}
