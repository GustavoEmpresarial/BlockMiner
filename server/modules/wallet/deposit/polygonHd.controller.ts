/**
 * GET /api/wallet/deposit/hd-address — custodial Polygon HD deposit address for the
 * authenticated user. Ported from legacy/server/modules/wallet/wallet.controller.ts
 * (getPolygonHdDepositAddress).
 */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../../shared/errors/httpStatusError.js";
import { logger } from "../../../core/logger/index.js";
import { isPolygonHdDepositEnabled } from "../../../shared/blockchain/polygonHd.config.js";
import { allocatePolygonHdAddressRemote } from "../../../shared/blockchain/polygonHdWallet.js";

const log = logger.child("PolygonHdDeposit");

export async function getPolygonHdDepositAddress(req: Request, res: Response): Promise<void> {
  if (!isPolygonHdDepositEnabled()) {
    res.status(503).json({ ok: false, message: "Polygon HD deposit is not enabled on this server." });
    return;
  }
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const allocated = await allocatePolygonHdAddressRemote(user.id);
    res.json({ ok: true, ...allocated });
  } catch (error: unknown) {
    log.error("getPolygonHdDepositAddress", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Unable to allocate HD deposit address." });
  }
}
