/** Ported from legacy/server/modules/machines/machines.controller.ts. */
import type { Request, Response } from "express";
import { requireSessionUser, readErrorCode } from "../../shared/errors/httpStatusError.js";
import {
  resolveCriticalMutation,
  finalizeCriticalMutationSuccess,
  cancelCriticalMutation,
} from "../../core/http/middleware/idempotency.js";
import { logger } from "../../core/logger/index.js";
import * as machinesRepo from "./machines.repository.js";
import * as machinesService from "./machines.service.js";
import { isValidSlotIndex, isValidSlotForSize } from "./machines.types.js";

const log = logger.child("machines.controller");

export async function listMachines(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const machines = await machinesService.listMachinesForUser(user.id);
    res.json({ ok: true, machines });
  } catch (error: unknown) {
    log.error("Error loading machines:", { error: String(error) });
    res.status(500).json({ ok: false, messageKey: "machines.errors.load_failed", message: "Unable to load machines." });
  }
}

export async function toggleMachine(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const { machineId, isActive } = req.body as { machineId: number; isActive: boolean };
    const machine = await machinesRepo.findMachineById(user.id, machineId);
    if (!machine) {
      res.status(404).json({ ok: false, messageKey: "machines.errors.machine_not_found", message: "Machine not found." });
      return;
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;
    try {
      await machinesService.toggleMachineForUser(user.id, machineId, isActive);
      const payload = {
        ok: true,
        messageKey: isActive ? "machines.activate_success" : "machines.deactivate_success",
        message: isActive ? "Machine activated." : "Machine deactivated.",
      };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      res.json(payload);
    } catch (error: unknown) {
      await cancelCriticalMutation(lease);
      if (readErrorCode(error) === "DISTRIBUTED_LOCK_BUSY") {
        res.status(409).json({ ok: false, code: "RACE_CONDITION_DETECTED", message: "This action conflicted with another request. Refresh the page and try again." });
        return;
      }
      throw error;
    }
  } catch (error: unknown) {
    log.error("Error toggling machine:", { error: String(error) });
    res.status(500).json({ ok: false, messageKey: "machines.errors.toggle_failed", message: "Unable to toggle machine." });
  }
}

export async function removeMachine(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const { machineId } = req.body as { machineId: number };
    const fullMiner = await machinesRepo.findFullMinerWithMinerInfo(user.id, machineId);
    if (!fullMiner) {
      res.status(404).json({ ok: false, messageKey: "machines.errors.miner_not_found", message: "Miner not found." });
      return;
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      await machinesService.removeMachineToInventory(user.id, machineId, new Date());
      const payload = { ok: true, messageKey: "machines.remove_success", message: "Miner sent to inventory!" };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      res.json(payload);
    } catch (error: unknown) {
      await cancelCriticalMutation(lease);
      if (readErrorCode(error) === "DISTRIBUTED_LOCK_BUSY") {
        res.status(409).json({ ok: false, code: "RACE_CONDITION_DETECTED", message: "This action conflicted with another request. Refresh the page and try again." });
        return;
      }
      log.error("Error removing miner:", { error: String(error) });
      res.status(500).json({ ok: false, messageKey: "machines.errors.remove_failed", message: "Error removing miner." });
    }
  } catch (error: unknown) {
    log.error("Error removing miner:", { error: String(error) });
    res.status(500).json({ ok: false, messageKey: "machines.errors.remove_failed", message: "Error removing miner." });
  }
}

export async function moveMachine(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const { machineId, targetSlotIndex } = req.body as { machineId: number; targetSlotIndex: number };

    if (!isValidSlotIndex(targetSlotIndex)) {
      res.status(400).json({ ok: false, messageKey: "machines.errors.invalid_target_slot", message: "Invalid target slot." });
      return;
    }

    const machine = await machinesRepo.findMachineById(user.id, machineId);
    if (!machine) {
      res.status(404).json({ ok: false, messageKey: "machines.errors.machine_not_found", message: "Machine not found." });
      return;
    }

    if (!isValidSlotForSize(targetSlotIndex, machine.slotSize)) {
      res.status(400).json({ ok: false, messageKey: "machines.errors.invalid_even_slot", message: "Large machines must start on an even slot." });
      return;
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      await machinesService.moveMachineForUser(user.id, machineId, targetSlotIndex, machine.slotSize);
      const payload = { ok: true, messageKey: "machines.move_success", message: "Machine moved successfully." };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      res.json(payload);
    } catch (error: unknown) {
      await cancelCriticalMutation(lease);
      if (readErrorCode(error) === "DISTRIBUTED_LOCK_BUSY") {
        res.status(409).json({ ok: false, code: "RACE_CONDITION_DETECTED", message: "This action conflicted with another request. Refresh the page and try again." });
        return;
      }
      log.error("Move Error:", { error: String(error) });
      res.status(500).json({ ok: false, messageKey: "machines.errors.move_failed", message: "Error moving machine." });
    }
  } catch (error: unknown) {
    log.error("Move Error:", { error: String(error) });
    res.status(500).json({ ok: false, messageKey: "machines.errors.move_failed", message: "Error moving machine." });
  }
}
