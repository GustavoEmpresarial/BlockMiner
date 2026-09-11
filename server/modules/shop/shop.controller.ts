import type { Request, Response } from "express";
import {
  requireSessionUser,
  readErrorCode,
} from "../../shared/errors/httpStatusError.js";
import {
  resolveCriticalMutation,
  finalizeCriticalMutationSuccess,
  cancelCriticalMutation,
} from "../../core/http/middleware/idempotency.js";
import { logger } from "../../core/logger/index.js";
import * as shopService from "./shop.service.js";
import { SHOP_ERROR_MESSAGE } from "./shop.errors.js";
import { SHOP_CURRENCY } from "./shop.config.js";
import { purchaseFansForUser, FAN_ERROR_MESSAGE, readFanMaxBulkQuantity } from "../fans/index.js";
import { purchaseRacksForUser, RACK_ERROR_MESSAGE, readRackMaxBulkQuantity } from "../racks/index.js";

const log = logger.child("shop.controller");

/** Product default max bulk qty; override with SHOP_MAX_BULK_QUANTITY. */
const DEFAULT_SHOP_MAX_BULK_QUANTITY = 25;

function readShopMaxBulkQuantity(): number {
  const raw = Number(process.env.SHOP_MAX_BULK_QUANTITY || DEFAULT_SHOP_MAX_BULK_QUANTITY);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_SHOP_MAX_BULK_QUANTITY;
}

export async function listMiners(req: Request, res: Response): Promise<void> {
  try {
    const rawPage = Number(req.query?.page || 1);
    const rawPageSize = Number(req.query?.pageSize || 24);
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Number.isInteger(rawPageSize) ? Math.min(Math.max(rawPageSize, 6), 48) : 24;
    const { items, total, currency, fans, racks, fanSalesAvailableAt, rackSalesAvailableAt } = await shopService.listMinersForShop(page, pageSize);
    res.json({ ok: true, page, pageSize, total, currency, miners: items, fans, racks, fanSalesAvailableAt, rackSalesAvailableAt });
  } catch (error) {
    log.error("listMiners error", { error: String(error) });
    res.status(500).json({
      ok: false,
      code: "SHOP_LIST_ERROR",
      messageKey: "shop.errors.list_error",
      message: "Unable to load miners.",
    });
  }
}

export async function purchaseMiner(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const minerId = Number(req.body?.minerId);
    const quantity = Number(req.body?.quantity || 1);
    const maxBulk = readShopMaxBulkQuantity();
    if (!Number.isInteger(minerId) || minerId <= 0) {
      res.status(400).json({
        ok: false,
        code: "SHOP_INVALID_MINER_ID",
        messageKey: "shop.errors.invalid_miner_id",
        message: "Invalid miner ID.",
      });
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxBulk) {
      res.status(400).json({
        ok: false,
        code: "SHOP_INVALID_QUANTITY",
        messageKey: "shop.errors.invalid_quantity",
        messageParams: { maxBulk },
        message: `Quantity must be between 1 and ${maxBulk}.`,
      });
      return;
    }
    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;
    try {
      const result = await shopService.executeMinerPurchaseTransaction(
        user.id,
        minerId,
        quantity,
        new Date(),
      );
      const payload = {
        ok: true,
        messageKey: "shop.purchase_success_detail",
        messageParams: { count: quantity, name: result.minerName },
        message: `${quantity}x ${result.minerName} added to your inventory!`,
        newBalance: result.newBalance,
        currency: result.currency ?? SHOP_CURRENCY,
      };
      await finalizeCriticalMutationSuccess(lease, {
        requestHash: ci.requestHash,
        responseJson: payload,
      });
      res.json(payload);
    } catch (error) {
      await cancelCriticalMutation(lease);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === SHOP_ERROR_MESSAGE.MINER_UNAVAILABLE) {
        res.status(404).json({
          ok: false,
          code: "SHOP_MINER_UNAVAILABLE",
          messageKey: "shop.errors.miner_unavailable",
          message: "Miner not found.",
        });
        return;
      }
      if (msg === SHOP_ERROR_MESSAGE.OUT_OF_STOCK) {
        res.status(400).json({
          ok: false,
          code: "SHOP_OUT_OF_STOCK",
          messageKey: "shop.errors.out_of_stock",
          message: msg,
        });
        return;
      }
      if (msg === SHOP_ERROR_MESSAGE.PURCHASE_LIMIT_REACHED) {
        res.status(400).json({
          ok: false,
          code: "SHOP_PURCHASE_LIMIT_REACHED",
          messageKey: "shop.errors.purchase_limit_reached",
          message: msg,
        });
        return;
      }
      if (msg === SHOP_ERROR_MESSAGE.INSUFFICIENT_BALANCE) {
        res.status(400).json({
          ok: false,
          code: "SHOP_INSUFFICIENT_BALANCE",
          messageKey: "shop.errors.insufficient_balance",
          message: msg,
        });
        return;
      }
      if (readErrorCode(error) === "DISTRIBUTED_LOCK_BUSY") {
        res.status(409).json({
          ok: false,
          code: "RACE_CONDITION_DETECTED",
          message: "This action conflicted with another request. Refresh the page and try again.",
        });
        return;
      }
      log.error("purchaseMiner transaction error", { error: msg });
      res.status(500).json({
        ok: false,
        code: "SHOP_PURCHASE_ERROR",
        messageKey: "shop.errors.purchase_error",
        message: "Purchase error.",
      });
    }
  } catch (error) {
    log.error("purchaseMiner fatal error", { error: String(error) });
    res.status(500).json({
      ok: false,
      code: "SHOP_PURCHASE_ERROR",
      messageKey: "shop.errors.purchase_error",
      message: "Purchase error.",
    });
  }
}

function mapFanPurchaseError(res: Response, msg: string): boolean {
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

function mapRackPurchaseError(res: Response, msg: string): boolean {
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

export async function purchaseFan(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const sku = typeof req.body?.sku === "string" ? req.body.sku.trim() : "";
    const quantity = Number(req.body?.quantity || 1);
    const maxBulk = readFanMaxBulkQuantity();
    if (!sku) {
      res.status(400).json({
        ok: false,
        code: "FAN_INVALID_SKU",
        messageKey: "fans.errors.invalid_sku",
        message: "Invalid fan product.",
      });
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxBulk) {
      res.status(400).json({
        ok: false,
        code: "FAN_INVALID_QUANTITY",
        messageKey: "fans.errors.invalid_quantity",
        messageParams: { maxBulk },
        message: `Quantity must be between 1 and ${maxBulk}.`,
      });
      return;
    }
    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;
    try {
      const result = await purchaseFansForUser(user.id, sku, quantity, "shop", new Date());
      const payload = {
        ok: true,
        messageKey: "fans.purchase_success_detail",
        messageParams: { count: result.quantity, credits: result.creditsGranted },
        message: `${result.quantity} fan unit(s) added to your inventory!`,
        newBalance: result.newBalance,
        fanCredits: result.fanCredits,
        currency: SHOP_CURRENCY,
      };
      await finalizeCriticalMutationSuccess(lease, {
        requestHash: ci.requestHash,
        responseJson: payload,
      });
      res.json(payload);
    } catch (error) {
      await cancelCriticalMutation(lease);
      const msg = error instanceof Error ? error.message : String(error);
      if (mapFanPurchaseError(res, msg)) return;
      if (readErrorCode(error) === "DISTRIBUTED_LOCK_BUSY") {
        res.status(409).json({
          ok: false,
          code: "RACE_CONDITION_DETECTED",
          message: "This action conflicted with another request. Refresh the page and try again.",
        });
        return;
      }
      log.error("purchaseFan transaction error", { error: msg });
      res.status(500).json({
        ok: false,
        code: "FAN_PURCHASE_ERROR",
        messageKey: "fans.errors.purchase_error",
        message: "Purchase error.",
      });
    }
  } catch (error) {
    log.error("purchaseFan fatal error", { error: String(error) });
    res.status(500).json({
      ok: false,
      code: "FAN_PURCHASE_ERROR",
      messageKey: "fans.errors.purchase_error",
      message: "Purchase error.",
    });
  }
}

export async function purchaseRack(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const sku = typeof req.body?.sku === "string" ? req.body.sku.trim() : "";
    const quantity = Number(req.body?.quantity || 1);
    const maxBulk = readRackMaxBulkQuantity();
    if (!sku) {
      res.status(400).json({
        ok: false,
        code: "RACK_INVALID_SKU",
        messageKey: "racks.errors.invalid_sku",
        message: "Invalid rack product.",
      });
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxBulk) {
      res.status(400).json({
        ok: false,
        code: "RACK_INVALID_QUANTITY",
        messageKey: "racks.errors.invalid_quantity",
        messageParams: { maxBulk },
        message: `Quantity must be between 1 and ${maxBulk}.`,
      });
      return;
    }
    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;
    try {
      const result = await purchaseRacksForUser(user.id, sku, quantity, "shop", new Date());
      const payload = {
        ok: true,
        messageKey: "racks.purchase_success_detail",
        messageParams: { count: result.quantity, credits: result.creditsGranted },
        message: `${result.quantity} rack(s) added to your inventory!`,
        newBalance: result.newBalance,
        rackCredits: result.rackCredits,
        currency: SHOP_CURRENCY,
      };
      await finalizeCriticalMutationSuccess(lease, {
        requestHash: ci.requestHash,
        responseJson: payload,
      });
      res.json(payload);
    } catch (error) {
      await cancelCriticalMutation(lease);
      const msg = error instanceof Error ? error.message : String(error);
      if (mapRackPurchaseError(res, msg)) return;
      if (readErrorCode(error) === "DISTRIBUTED_LOCK_BUSY") {
        res.status(409).json({
          ok: false,
          code: "RACE_CONDITION_DETECTED",
          message: "This action conflicted with another request. Refresh the page and try again.",
        });
        return;
      }
      log.error("purchaseRack transaction error", { error: msg });
      res.status(500).json({
        ok: false,
        code: "RACK_PURCHASE_ERROR",
        messageKey: "racks.errors.purchase_error",
        message: "Purchase error.",
      });
    }
  } catch (error) {
    log.error("purchaseRack fatal error", { error: String(error) });
    res.status(500).json({
      ok: false,
      code: "RACK_PURCHASE_ERROR",
      messageKey: "racks.errors.purchase_error",
      message: "Purchase error.",
    });
  }
}
