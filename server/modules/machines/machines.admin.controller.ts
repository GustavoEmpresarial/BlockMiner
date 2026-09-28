import type { Request, Response } from "express";
import { logger } from "../../core/logger/index.js";
import * as machinesRepo from "./machines.repository.js";

const log = logger.child("machines.admin.controller");

export async function adminListUserMachines(req: Request, res: Response): Promise<void> {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ ok: false, message: "Invalid user id." });
      return;
    }
    const machines = await machinesRepo.listUserMachines(userId);
    res.json({ ok: true, machines });
  } catch (error) {
    log.error("Error loading machines for admin:", { error: String(error) });
    res.status(500).json({ ok: false, message: "Unable to load machines." });
  }
}
