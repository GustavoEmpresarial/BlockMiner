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
import { reportError } from "../../core/errors/error-reporter.js";
import * as shopService from "./shop.service.js";
import { SHOP_ERROR_MESSAGE, SHOP_ERROR_CODE } from "./shop.errors.js";
import { SHOP_CURRENCY } from "./shop.config.js";
import {
  readShopMaxBulkQuantity,
  listMinersQuerySchema,
  createPurchaseMinerSchema,
  createPurchaseFanSchema,
  createPurchaseRackSchema,
} from "./shop.schemas.js";
import { purchaseFansForUser, FAN_ERROR_MESSAGE, readFanMaxBulkQuantity } from "../fans/index.js";
import { purchaseRacksForUser, RACK_ERROR_MESSAGE, readRackMaxBulkQuantity } from "../racks/index.js";

export { readShopMaxBulkQuantity };

export const shopServiceRef = {
  listMinersForShop: shopService.listMinersForShop,
  executeMinerPurchaseTransaction: shopService.executeMinerPurchaseTransaction,
};

export async function listMiners(req: Request, res: Response): Promise<void> {
  try {
    const parsedQuery = listMinersQuerySchema.safeParse(req.query);
    const page = parsedQuery.success ? parsedQuery.data.page : 1;
    const pageSize = parsedQuery.success ? parsedQuery.data.pageSize : 24;

    const { items, total, currency, fans, racks, fanSalesAvailableAt, rackSalesAvailableAt } =
      await shopServiceRef.listMinersForShop(page, pageSize);

    res.json({
      ok: true,
      page,
      pageSize,
      total,
      currency,
      miners: items,
      fans,
      racks,
      fanSalesAvailableAt,
      rackSalesAvailableAt,
    });
  } catch (error) {
    reportError({
      code: SHOP_ERROR_CODE.SHOP_LIST_ERROR,
      category: "DATABASE",
      severity: "ERROR",
      module: "shop.listMiners",
      error,
      req,
      context: { page: req.query?.page, pageSize: req.query?.pageSize },
    });
    res.status(500).json({
      ok: false,
      code: SHOP_ERROR_CODE.SHOP_LIST_ERROR,
      messageKey: "shop.errors.list_error",
      message: "Unable to load miners.",
    });
  }
}

export async function purchaseMiner(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;

    const maxBulk = readShopMaxBulkQuantity();
    const parsed = createPurchaseMinerSchema(maxBulk).safeParse(req.body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const isQuantityError = issue?.path.includes("quantity");

      if (isQuantityError) {
        res.status(400).json({
          ok: false,
          code: SHOP_ERROR_CODE.SHOP_INVALID_QUANTITY,
          messageKey: "shop.errors.invalid_quantity",
          messageParams: { maxBulk },
          message: `Quantity must be between 1 and ${maxBulk}.`,
        });
        return;
      }

      res.status(400).json({
        ok: false,
        code: SHOP_ERROR_CODE.SHOP_INVALID_MINER_ID,
        messageKey: "shop.errors.invalid_miner_id",
        message: "Invalid miner ID.",
      });
      return;
    }

    const { minerId, quantity } = parsed.data;

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const result = await shopServiceRef.executeMinerPurchaseTransaction(
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
        reportError({
          code: SHOP_ERROR_CODE.SHOP_MINER_UNAVAILABLE,
          category: "BUSINESS",
          severity: "INFO",
          module: "shop.purchaseMiner",
          req,
          context: { userId: user.id, minerId, quantity },
        });
        res.status(404).json({
          ok: false,
          code: SHOP_ERROR_CODE.SHOP_MINER_UNAVAILABLE,
          messageKey: "shop.errors.miner_unavailable",
          message: "Miner not found.",
        });
        return;
      }

      if (msg === SHOP_ERROR_MESSAGE.OUT_OF_STOCK) {
        reportError({
          code: SHOP_ERROR_CODE.SHOP_OUT_OF_STOCK,
          category: "BUSINESS",
          severity: "INFO",
          module: "shop.purchaseMiner",
          req,
          context: { userId: user.id, minerId, quantity },
        });
        res.status(400).json({
          ok: false,
          code: SHOP_ERROR_CODE.SHOP_OUT_OF_STOCK,
          messageKey: "shop.errors.out_of_stock",
          message: msg,
        });
        return;
      }

      if (msg === SHOP_ERROR_MESSAGE.PURCHASE_LIMIT_REACHED) {
        reportError({
          code: SHOP_ERROR_CODE.SHOP_PURCHASE_LIMIT_REACHED,
          category: "BUSINESS",
          severity: "INFO",
          module: "shop.purchaseMiner",
          req,
          context: { userId: user.id, minerId, quantity },
        });
        res.status(400).json({
          ok: false,
          code: SHOP_ERROR_CODE.SHOP_PURCHASE_LIMIT_REACHED,
          messageKey: "shop.errors.purchase_limit_reached",
          message: msg,
        });
        return;
      }

      if (msg === SHOP_ERROR_MESSAGE.INSUFFICIENT_BALANCE) {
        reportError({
          code: SHOP_ERROR_CODE.SHOP_INSUFFICIENT_BALANCE,
          category: "BUSINESS",
          severity: "INFO",
          module: "shop.purchaseMiner",
          req,
          context: { userId: user.id, minerId, quantity },
        });
        res.status(400).json({
          ok: false,
          code: SHOP_ERROR_CODE.SHOP_INSUFFICIENT_BALANCE,
          messageKey: "shop.errors.insufficient_balance",
          message: msg,
        });
        return;
      }

      if (readErrorCode(error) === "DISTRIBUTED_LOCK_BUSY") {
        reportError({
          code: SHOP_ERROR_CODE.RACE_CONDITION_DETECTED,
          category: "INFRASTRUCTURE",
          severity: "WARNING",
          module: "shop.purchaseMiner",
          req,
          context: { userId: user.id, minerId, quantity },
        });
        res.status(409).json({
          ok: false,
          code: SHOP_ERROR_CODE.RACE_CONDITION_DETECTED,
          message: "This action conflicted with another request. Refresh the page and try again.",
        });
        return;
      }

      reportError({
        code: SHOP_ERROR_CODE.SHOP_PURCHASE_ERROR,
        category: "DATABASE",
        severity: "ERROR",
        module: "shop.purchaseMiner",
        error,
        req,
        context: { userId: user.id, minerId, quantity },
      });
      res.status(500).json({
        ok: false,
        code: SHOP_ERROR_CODE.SHOP_PURCHASE_ERROR,
        messageKey: "shop.errors.purchase_error",
        message: "Purchase error.",
      });
    }
  } catch (error) {
    reportError({
      code: SHOP_ERROR_CODE.SHOP_PURCHASE_ERROR,
      category: "UNKNOWN",
      severity: "CRITICAL",
      module: "shop.purchaseMiner.fatal",
      error,
      req,
    });
    res.status(500).json({
      ok: false,
      code: SHOP_ERROR_CODE.SHOP_PURCHASE_ERROR,
      messageKey: "shop.errors.purchase_error",
      message: "Purchase error.",
    });
  }
}

function handleHardwareCatalogPurchaseError(
  res: Response,
  req: Request,
  userId: number,
  sku: string,
  quantity: number,
  error: unknown,
  moduleType: "fans" | "racks",
): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const isFan = moduleType === "fans";
  const NOT_AVAILABLE = isFan ? FAN_ERROR_MESSAGE.NOT_AVAILABLE_YET : RACK_ERROR_MESSAGE.NOT_AVAILABLE_YET;
  const INVALID_SKU = isFan ? FAN_ERROR_MESSAGE.INVALID_SKU : RACK_ERROR_MESSAGE.INVALID_SKU;
  const INVALID_QTY = isFan ? FAN_ERROR_MESSAGE.INVALID_QUANTITY : RACK_ERROR_MESSAGE.INVALID_QUANTITY;
  const INSUFFICIENT = isFan ? FAN_ERROR_MESSAGE.INSUFFICIENT_BALANCE : RACK_ERROR_MESSAGE.INSUFFICIENT_BALANCE;

  const prefix = isFan ? "FAN" : "RACK";
  const messageKeyPrefix = isFan ? "fans" : "racks";
  const maxBulk = isFan ? readFanMaxBulkQuantity() : readRackMaxBulkQuantity();

  if (msg === NOT_AVAILABLE) {
    reportError({
      code: `${prefix}_NOT_AVAILABLE_YET`,
      category: "BUSINESS",
      severity: "INFO",
      module: `shop.purchase${isFan ? "Fan" : "Rack"}`,
      req,
      context: { userId, sku, quantity },
    });
    res.status(403).json({
      ok: false,
      code: `${prefix}_NOT_AVAILABLE_YET`,
      messageKey: `${messageKeyPrefix}.errors.not_available_yet`,
      message: `${isFan ? "Fan" : "Rack"} sales are not open yet.`,
    });
    return true;
  }

  if (msg === INVALID_SKU) {
    res.status(400).json({
      ok: false,
      code: `${prefix}_INVALID_SKU`,
      messageKey: `${messageKeyPrefix}.errors.invalid_sku`,
      message: `Invalid ${isFan ? "fan" : "rack"} product.`,
    });
    return true;
  }

  if (msg === INVALID_QTY) {
    res.status(400).json({
      ok: false,
      code: `${prefix}_INVALID_QUANTITY`,
      messageKey: `${messageKeyPrefix}.errors.invalid_quantity`,
      messageParams: { maxBulk },
      message: "Invalid quantity.",
    });
    return true;
  }

  if (msg === INSUFFICIENT) {
    reportError({
      code: `${prefix}_INSUFFICIENT_BALANCE`,
      category: "BUSINESS",
      severity: "INFO",
      module: `shop.purchase${isFan ? "Fan" : "Rack"}`,
      req,
      context: { userId, sku, quantity },
    });
    res.status(400).json({
      ok: false,
      code: `${prefix}_INSUFFICIENT_BALANCE`,
      messageKey: `${messageKeyPrefix}.errors.insufficient_balance`,
      message: "Insufficient BLK balance.",
    });
    return true;
  }

  if (readErrorCode(error) === "DISTRIBUTED_LOCK_BUSY") {
    reportError({
      code: SHOP_ERROR_CODE.RACE_CONDITION_DETECTED,
      category: "INFRASTRUCTURE",
      severity: "WARNING",
      module: `shop.purchase${isFan ? "Fan" : "Rack"}`,
      req,
      context: { userId, sku, quantity },
    });
    res.status(409).json({
      ok: false,
      code: SHOP_ERROR_CODE.RACE_CONDITION_DETECTED,
      message: "This action conflicted with another request. Refresh the page and try again.",
    });
    return true;
  }

  return false;
}

export async function purchaseFan(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;

    const maxBulk = readFanMaxBulkQuantity();
    const parsed = createPurchaseFanSchema(maxBulk).safeParse(req.body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const isQuantityError = issue?.path.includes("quantity");

      if (isQuantityError) {
        res.status(400).json({
          ok: false,
          code: SHOP_ERROR_CODE.FAN_INVALID_QUANTITY,
          messageKey: "fans.errors.invalid_quantity",
          messageParams: { maxBulk },
          message: `Quantity must be between 1 and ${maxBulk}.`,
        });
        return;
      }

      res.status(400).json({
        ok: false,
        code: SHOP_ERROR_CODE.FAN_INVALID_SKU,
        messageKey: "fans.errors.invalid_sku",
        message: "Invalid fan product.",
      });
      return;
    }

    const { sku, quantity } = parsed.data;

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
      if (handleHardwareCatalogPurchaseError(res, req, user.id, sku, quantity, error, "fans")) {
        return;
      }

      reportError({
        code: SHOP_ERROR_CODE.FAN_PURCHASE_ERROR,
        category: "DATABASE",
        severity: "ERROR",
        module: "shop.purchaseFan",
        error,
        req,
        context: { userId: user.id, sku, quantity },
      });
      res.status(500).json({
        ok: false,
        code: SHOP_ERROR_CODE.FAN_PURCHASE_ERROR,
        messageKey: "fans.errors.purchase_error",
        message: "Purchase error.",
      });
    }
  } catch (error) {
    reportError({
      code: SHOP_ERROR_CODE.FAN_PURCHASE_ERROR,
      category: "UNKNOWN",
      severity: "CRITICAL",
      module: "shop.purchaseFan.fatal",
      error,
      req,
    });
    res.status(500).json({
      ok: false,
      code: SHOP_ERROR_CODE.FAN_PURCHASE_ERROR,
      messageKey: "fans.errors.purchase_error",
      message: "Purchase error.",
    });
  }
}

export async function purchaseRack(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;

    const maxBulk = readRackMaxBulkQuantity();
    const parsed = createPurchaseRackSchema(maxBulk).safeParse(req.body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const isQuantityError = issue?.path.includes("quantity");

      if (isQuantityError) {
        res.status(400).json({
          ok: false,
          code: SHOP_ERROR_CODE.RACK_INVALID_QUANTITY,
          messageKey: "racks.errors.invalid_quantity",
          messageParams: { maxBulk },
          message: `Quantity must be between 1 and ${maxBulk}.`,
        });
        return;
      }

      res.status(400).json({
        ok: false,
        code: SHOP_ERROR_CODE.RACK_INVALID_SKU,
        messageKey: "racks.errors.invalid_sku",
        message: "Invalid rack product.",
      });
      return;
    }

    const { sku, quantity } = parsed.data;

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
      if (handleHardwareCatalogPurchaseError(res, req, user.id, sku, quantity, error, "racks")) {
        return;
      }

      reportError({
        code: SHOP_ERROR_CODE.RACK_PURCHASE_ERROR,
        category: "DATABASE",
        severity: "ERROR",
        module: "shop.purchaseRack",
        error,
        req,
        context: { userId: user.id, sku, quantity },
      });
      res.status(500).json({
        ok: false,
        code: SHOP_ERROR_CODE.RACK_PURCHASE_ERROR,
        messageKey: "racks.errors.purchase_error",
        message: "Purchase error.",
      });
    }
  } catch (error) {
    reportError({
      code: SHOP_ERROR_CODE.RACK_PURCHASE_ERROR,
      category: "UNKNOWN",
      severity: "CRITICAL",
      module: "shop.purchaseRack.fatal",
      error,
      req,
    });
    res.status(500).json({
      ok: false,
      code: SHOP_ERROR_CODE.RACK_PURCHASE_ERROR,
      messageKey: "racks.errors.purchase_error",
      message: "Purchase error.",
    });
  }
}
