import type { Request, Response } from "express";
import { reportError } from "../../core/errors/error-reporter.js";
import {
  readErrorCode,
  readErrorMessage,
  readHttpStatus,
  requireSessionUser,
} from "../../shared/errors/httpStatusError.js";
import { PARTS_ERROR_CODE } from "./parts.errors.js";
import { mergeMachineForUser } from "./parts.merge.service.js";
import { getPartsOverview } from "./parts.service.js";
import { craftPartsForUser } from "./parts.craft.js";

const MERGE_MESSAGE_KEY: Record<string, string> = {
  [PARTS_ERROR_CODE.INVALID_MINER]: "parts.merge_unavailable",
  [PARTS_ERROR_CODE.MINER_UNAVAILABLE]: "parts.merge_unavailable",
  [PARTS_ERROR_CODE.INVALID_PLATES]: "parts.merge_need_parts",
  [PARTS_ERROR_CODE.RARITY_MISMATCH]: "parts.merge_rarity",
  [PARTS_ERROR_CODE.INSUFFICIENT_PARTS]: "parts.merge_need_parts",
  [PARTS_ERROR_CODE.INSUFFICIENT_BALANCE]: "parts.merge_need_balance",
  [PARTS_ERROR_CODE.PRICE_UNAVAILABLE]: "parts.merge_price_unavailable",
  [PARTS_ERROR_CODE.INSUFFICIENT_MACHINES]: "parts.merge_need_machines",
  [PARTS_ERROR_CODE.MAX_LEVEL_REACHED]: "parts.merge_max_level",
  [PARTS_ERROR_CODE.OUT_OF_STOCK]: "parts.merge_stock",
  [PARTS_ERROR_CODE.PURCHASE_LIMIT]: "parts.merge_limit",
};

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

export async function mergeParts(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;

  const minerId = Number(req.body?.minerId);
  if (!Number.isInteger(minerId) || minerId <= 0) {
    res.status(400).json({
      ok: false,
      code: PARTS_ERROR_CODE.INVALID_MINER,
      messageKey: "parts.merge_unavailable",
      message: "This machine is not available.",
    });
    return;
  }

  try {
    const currentLevel = req.body?.currentLevel != null ? Number(req.body?.currentLevel) : 1;
    const result = await mergeMachineForUser(
      user.id,
      minerId,
      req.body?.plates,
      req.body?.source,
      currentLevel,
      req.body?.paymentAsset,
    );
    res.json({ ok: true, ...result });
  } catch (error) {
    const status = readHttpStatus(error);
    const code = readErrorCode(error);
    if (status != null && status < 500 && code && MERGE_MESSAGE_KEY[code]) {
      res.status(status).json({
        ok: false,
        code,
        messageKey: MERGE_MESSAGE_KEY[code],
        message: readErrorMessage(error),
      });
      return;
    }
    reportError({
      code: PARTS_ERROR_CODE.MERGE_ERROR,
      category: "DATABASE",
      severity: "ERROR",
      module: "parts.mergeParts",
      error,
      req,
    });
    res.status(500).json({
      ok: false,
      code: PARTS_ERROR_CODE.MERGE_ERROR,
      messageKey: "parts.merge_error",
      message: "Unable to merge this machine.",
    });
  }
}

export async function craftPart(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;

  try {
    const { partSlug, fromRarity, count } = req.body ?? {};
    const result = await craftPartsForUser(user.id, partSlug, fromRarity, count);
    res.json(result);
  } catch (error) {
    const status = readHttpStatus(error);
    const code = readErrorCode(error);
    if (status != null && status < 500 && code) {
      res.status(status).json({
        ok: false,
        code,
        message: readErrorMessage(error),
      });
      return;
    }
    reportError({
      code: PARTS_ERROR_CODE.CRAFT_ERROR,
      category: "DATABASE",
      severity: "ERROR",
      module: "parts.craftPart",
      error,
      req,
    });
    res.status(500).json({
      ok: false,
      code: PARTS_ERROR_CODE.CRAFT_ERROR,
      messageKey: "parts.craft_error",
      message: "Unable to craft parts.",
    });
  }
}
