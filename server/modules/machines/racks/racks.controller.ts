/** Ported from legacy/server/modules/racks/racks.controller.ts. */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../../shared/errors/httpStatusError.js";
import { logger } from "../../../core/logger/index.js";
import * as racksRepo from "./racks.repository.js";
import { isValidRackIndex, isValidRackName } from "./racks.types.js";

const log = logger.child("racks.controller");

type UpdateRackBody = {
  rackIndex?: unknown;
  customName?: unknown;
};

export async function listRacks(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const racks = await racksRepo.listRacks(user.id);
    res.json({ ok: true, racks });
  } catch (error: unknown) {
    log.error("Error loading racks:", { error: String(error) });
    res.status(500).json({ ok: false, message: "Unable to load racks." });
  }
}

export async function updateRack(req: Request<import("express-serve-static-core").ParamsDictionary, unknown, UpdateRackBody>, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;

    const rackIndex = Number(req.body?.rackIndex);
    const customName = String(req.body?.customName || "").trim();

    if (!isValidRackIndex(rackIndex)) {
      res.status(400).json({ ok: false, message: "Invalid rack index." });
      return;
    }

    if (!isValidRackName(customName)) {
      res.status(400).json({ ok: false, message: "Invalid rack name." });
      return;
    }

    await racksRepo.upsertRackName(user.id, rackIndex, customName);
    res.json({ ok: true, message: "Rack name updated successfully." });
  } catch (error: unknown) {
    log.error("Error updating rack:", { error: String(error) });
    res.status(500).json({ ok: false, message: "Unable to update rack." });
  }
}
