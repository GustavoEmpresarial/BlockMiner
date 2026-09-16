import {
  cancelCriticalMutation,
  finalizeCriticalMutationSuccess,
  resolveCriticalMutation,
} from "../../core/http/middleware/idempotency.js";
import { logger } from "../../core/logger/index.js";
import { readErrorCode, requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { purchaseFansForUser, FAN_ERROR_MESSAGE, readFanMaxBulkQuantity } from "../fans/index.js";
import { purchaseRacksForUser, RACK_ERROR_MESSAGE, readRackMaxBulkQuantity } from "../racks/index.js";
import * as svc from "./offer-events.service.js";

const log = logger.child("offer-events.controller");

export async function listActiveOfferEvents(req: import("express").Request, res: import("express").Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const data = await svc.listActiveOfferEventsForUser(user.id);
    res.json({ ok: true, ...data });
  } catch (e) {
    log.error("listActiveOfferEvents", { error: String(e) });
    res.status(500).json({ ok: false, message: "Unable to load offer events." });
  }
}

export async function purchaseOfferMiner(req: import("express").Request, res: import("express").Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const eventMinerId = Number(req.body?.eventMinerId);
    if (!Number.isInteger(eventMinerId) || eventMinerId <= 0) {
      res.status(400).json({ ok: false, message: "Invalid event miner id." });
      return;
    }
    const bodyQty = req.body?.quantity;
    const quantity = Math.max(1, Math.min(25, parseInt(String(bodyQty ?? 1), 10) || 1));
    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;
    try {
      const out = await svc.purchaseEventMinerForUser(user.id, eventMinerId, quantity);
      if (!out.ok) {
        await cancelCriticalMutation(lease);
        res.status(out.status || 500).json({ ok: false, message: out.message, code: out.code });
        return;
      }
      const payload = { ok: true, message: out.message, balances: out.balances };
      await finalizeCriticalMutationSuccess(lease, {
        requestHash: ci.requestHash,
        responseJson: payload,
      });
      res.json(payload);
    } catch (inner) {
      await cancelCriticalMutation(lease);
      if (readErrorCode(inner) === "DISTRIBUTED_LOCK_BUSY") {
        res.status(409).json({
          ok: false,
          code: "RACE_CONDITION_DETECTED",
          message: "This action conflicted with another request. Refresh the page and try again.",
        });
        return;
      }
      throw inner;
    }
  } catch (e) {
    log.error("purchaseOfferMiner", { error: String(e) });
    res.status(500).json({ ok: false, message: "Purchase failed." });
  }
}

function mapFanPurchaseError(res: import("express").Response, msg: string): boolean {
  if (msg === FAN_ERROR_MESSAGE.NOT_AVAILABLE_YET) {
    res.status(403).json({
      ok: false,
      code: "FAN_NOT_AVAILABLE_YET",
      messageKey: "fans.errors.not_available_yet",
      message: "Fan sales are not open yet.",
    });
    return true;
  }
  if (msg === FAN_ERROR_MESSAGE.INVALID_SKU) {
    res.status(400).json({
      ok: false,
      code: "FAN_INVALID_SKU",
      messageKey: "fans.errors.invalid_sku",
      message: "Invalid fan product.",
    });
    return true;
  }
  if (msg === FAN_ERROR_MESSAGE.INVALID_QUANTITY) {
    res.status(400).json({
      ok: false,
      code: "FAN_INVALID_QUANTITY",
      messageKey: "fans.errors.invalid_quantity",
      messageParams: { maxBulk: readFanMaxBulkQuantity() },
      message: "Invalid quantity.",
    });
    return true;
  }
  if (msg === FAN_ERROR_MESSAGE.INSUFFICIENT_BALANCE) {
    res.status(400).json({
      ok: false,
      code: "FAN_INSUFFICIENT_BALANCE",
      messageKey: "fans.errors.insufficient_balance",
      message: "Insufficient BLK balance.",
    });
    return true;
  }
  return false;
}

function mapRackPurchaseError(res: import("express").Response, msg: string): boolean {
  if (msg === RACK_ERROR_MESSAGE.NOT_AVAILABLE_YET) {
    res.status(403).json({
      ok: false,
      code: "RACK_NOT_AVAILABLE_YET",
      messageKey: "racks.errors.not_available_yet",
      message: "Rack sales are not open yet.",
    });
    return true;
  }
  if (msg === RACK_ERROR_MESSAGE.INVALID_SKU) {
    res.status(400).json({
      ok: false,
      code: "RACK_INVALID_SKU",
      messageKey: "racks.errors.invalid_sku",
      message: "Invalid rack product.",
    });
    return true;
  }
  if (msg === RACK_ERROR_MESSAGE.INVALID_QUANTITY) {
    res.status(400).json({
      ok: false,
      code: "RACK_INVALID_QUANTITY",
      messageKey: "racks.errors.invalid_quantity",
      messageParams: { maxBulk: readRackMaxBulkQuantity() },
      message: "Invalid quantity.",
    });
    return true;
  }
  if (msg === RACK_ERROR_MESSAGE.INSUFFICIENT_BALANCE) {
    res.status(400).json({
      ok: false,
      code: "RACK_INSUFFICIENT_BALANCE",
      messageKey: "racks.errors.insufficient_balance",
      message: "Insufficient BLK balance.",
    });
    return true;
  }
  return false;
}

export async function purchaseFanOffer(req: import("express").Request, res: import("express").Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const sku = typeof req.body?.sku === "string" ? req.body.sku.trim() : "";
    const quantity = Number(req.body?.quantity || 1);
    const maxBulk = readFanMaxBulkQuantity();
    if (!sku) {
      res.status(400).json({ ok: false, message: "Invalid fan product." });
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxBulk) {
      res.status(400).json({ ok: false, message: `Quantity must be between 1 and ${maxBulk}.` });
      return;
    }
    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;
    try {
      const result = await purchaseFansForUser(user.id, sku, quantity, "offer", new Date());
      const payload = {
        ok: true,
        messageKey: "fans.purchase_success_detail",
        messageParams: { count: result.quantity, credits: result.creditsGranted },
        message: `${result.quantity} fan unit(s) added to your inventory!`,
        newBalance: result.newBalance,
        fanCredits: result.fanCredits,
      };
      await finalizeCriticalMutationSuccess(lease, {
        requestHash: ci.requestHash,
        responseJson: payload,
      });
      res.json(payload);
    } catch (inner) {
      await cancelCriticalMutation(lease);
      const msg = inner instanceof Error ? inner.message : String(inner);
      if (mapFanPurchaseError(res, msg)) return;
      if (readErrorCode(inner) === "DISTRIBUTED_LOCK_BUSY") {
        res.status(409).json({
          ok: false,
          code: "RACE_CONDITION_DETECTED",
          message: "This action conflicted with another request. Refresh the page and try again.",
        });
        return;
      }
      throw inner;
    }
  } catch (e) {
    log.error("purchaseFanOffer", { error: String(e) });
    res.status(500).json({ ok: false, message: "Purchase failed." });
  }
}

export async function purchaseRackOffer(req: import("express").Request, res: import("express").Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const sku = typeof req.body?.sku === "string" ? req.body.sku.trim() : "";
    const quantity = Number(req.body?.quantity || 1);
    const maxBulk = readRackMaxBulkQuantity();
    if (!sku) {
      res.status(400).json({ ok: false, message: "Invalid rack product." });
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxBulk) {
      res.status(400).json({ ok: false, message: `Quantity must be between 1 and ${maxBulk}.` });
      return;
    }
    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;
    try {
      const result = await purchaseRacksForUser(user.id, sku, quantity, "offer", new Date());
      const payload = {
        ok: true,
        messageKey: "racks.purchase_success_detail",
        messageParams: { count: result.quantity, credits: result.creditsGranted },
        message: `${result.quantity} rack(s) added to your inventory!`,
        newBalance: result.newBalance,
        rackCredits: result.rackCredits,
      };
      await finalizeCriticalMutationSuccess(lease, {
        requestHash: ci.requestHash,
        responseJson: payload,
      });
      res.json(payload);
    } catch (inner) {
      await cancelCriticalMutation(lease);
      const msg = inner instanceof Error ? inner.message : String(inner);
      if (mapRackPurchaseError(res, msg)) return;
      if (readErrorCode(inner) === "DISTRIBUTED_LOCK_BUSY") {
        res.status(409).json({
          ok: false,
          code: "RACE_CONDITION_DETECTED",
          message: "This action conflicted with another request. Refresh the page and try again.",
        });
        return;
      }
      throw inner;
    }
  } catch (e) {
    log.error("purchaseRackOffer", { error: String(e) });
    res.status(500).json({ ok: false, message: "Purchase failed." });
  }
}
