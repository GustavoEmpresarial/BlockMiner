import type { Request, Response } from "express";
import {
  cancelCriticalMutation,
  finalizeCriticalMutationSuccess,
  resolveCriticalMutation,
} from "../../core/http/middleware/idempotency.js";
import { reportError } from "../../core/errors/error-reporter.js";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { purchaseShowcaseRacksForChannel } from "./rooms.service.js";

const PURCHASE_ERROR_CODE = "SHOWCASE_RACK_PURCHASE_ERROR";

/**
 * Shop and offer checkout for the 3D rack.
 * Sits on the existing purchase-rack routes so their idempotency lease still wraps the debit.
 * Price and permission are decided in purchaseShowcaseRacksForChannel, never from the body.
 */
export async function handleShowcaseRackCatalogPurchase(
  req: Request,
  res: Response,
  channel: "shop" | "offer",
): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;

  const quantity = Number(req.body?.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1) {
    res.status(400).json({
      ok: false,
      code: "SHOWCASE_RACK_INVALID_QUANTITY",
      messageKey: "racks.errors.showcase_invalid_quantity",
      message: "Invalid quantity.",
    });
    return;
  }

  const idem = await resolveCriticalMutation(req, res);
  if (!idem) return;
  const { lease, ci } = idem;

  try {
    const result = await purchaseShowcaseRacksForChannel(user.id, quantity, channel);
    if (!result.ok) {
      await cancelCriticalMutation(lease);
      res.status(result.status).json({
        ok: false,
        code: result.code,
        messageKey: result.messageKey,
        message: result.message,
      });
      return;
    }

    const payload = {
      ok: true,
      messageKey: "racks.showcase_3d_purchase_success",
      messageParams: { count: result.quantity },
      message: "3D rack added. Install it on an empty pad.",
      newBalance: result.newBalance,
      rackCredits: result.rackCredits,
      currency: "BLK",
      totalPrice: result.totalPrice,
      unitPrice: result.unitPrice,
    };
    await finalizeCriticalMutationSuccess(lease, {
      requestHash: ci.requestHash,
      responseJson: payload,
    });
    res.json(payload);
  } catch (error) {
    await cancelCriticalMutation(lease);
    reportError({
      code: PURCHASE_ERROR_CODE,
      category: "DATABASE",
      severity: "ERROR",
      module: `rooms.showcaseRack.${channel}`,
      error,
      req,
      context: { userId: user.id, quantity, channel },
    });
    res.status(500).json({
      ok: false,
      code: PURCHASE_ERROR_CODE,
      messageKey: "racks.errors.purchase_error",
      message: "Purchase error.",
    });
  }
}
