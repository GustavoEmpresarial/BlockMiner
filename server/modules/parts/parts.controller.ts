import type { Request, Response } from "express";
import { reportError } from "../../core/errors/error-reporter.js";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { PARTS_ERROR_CODE } from "./parts.errors.js";
import { getPartsOverview } from "./parts.service.js";

export async function listParts(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const overview = await getPartsOverview(user.id);
    res.json({ ok: true, ...overview });
  } catch (error) {
    reportError({
      code: PARTS_ERROR_CODE.LIST_ERROR,
      category: "DATABASE",
      severity: "ERROR",
      module: "parts.listParts",
      error,
      req,
    });
    res.status(500).json({
      ok: false,
      code: PARTS_ERROR_CODE.LIST_ERROR,
      messageKey: "parts.load_error",
      message: "Unable to load parts.",
    });
  }
}
