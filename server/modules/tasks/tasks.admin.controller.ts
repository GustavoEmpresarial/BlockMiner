/**
 * Admin controller for daily tasks definitions CRUD.
 * Re-implemented in strict TypeScript without `@ts-nocheck` or `any`.
 */
import type { Request, Response } from "express";
import * as repo from "./tasks.repository.js";
import {
  parseCreateDailyTaskDefinition,
  parsePatchDailyTaskDefinition,
} from "./tasks.admin.validation.js";
import { logger } from "../../core/logger/index.js";
import { logAdminAction } from "../admin/admin.audit-log.service.js";

const log = logger.child("tasks.admin.controller");

function parsePositiveIntId(val: unknown): number | null {
  const n = Number(val);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function prismaErrCode(e: unknown): string | undefined {
  if (e !== null && typeof e === "object" && "code" in e) {
    const c = (e as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

export async function listDefinitions(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await repo.listDailyTaskDefinitions();
    res.json({ ok: true, definitions: rows });
  } catch (e: unknown) {
    log.error("listDefinitions", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to load daily task definitions." });
  }
}

export async function createDefinition(req: Request, res: Response): Promise<void> {
  try {
    const parsed = parseCreateDailyTaskDefinition(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json({ ok: false, message: parsed.message });
      return;
    }

    const { data, autoSortOrder } = parsed;

    if (data.rewardMinerId) {
      const miner = await repo.findMinerById(data.rewardMinerId);
      if (!miner) {
        res.status(400).json({ ok: false, message: "rewardMinerId does not exist." });
        return;
      }
    }

    if (data.rewardEventMinerId) {
      const em = await repo.findEventMinerById(data.rewardEventMinerId);
      if (!em) {
        res.status(400).json({ ok: false, message: "rewardEventMinerId does not exist." });
        return;
      }
    }

    if (data.internalOfferwallOfferId) {
      const offer = await repo.findInternalOfferwallOfferById(data.internalOfferwallOfferId);
      if (!offer) {
        res.status(400).json({ ok: false, message: "internalOfferwallOfferId does not exist." });
        return;
      }
    }

    if (autoSortOrder) {
      const max = await repo.getMaxSortOrder();
      data.sortOrder = max + 10;
    }

    const row = await repo.createDailyTaskDefinition(data);

    void logAdminAction({
      adminId: req.admin?.adminId,
      adminEmail: req.admin?.email,
      sessionId: req.admin?.sessionId,
      action: "TASK_DEFINITION_CREATE",
      module: "tasks",
      resource: "daily_task_definitions",
      resourceId: String(row.id),
      newValue: row,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json({ ok: true, definition: row });
  } catch (e: unknown) {
    const code = prismaErrCode(e);
    if (code === "P2002") {
      res.status(409).json({ ok: false, message: "Slug already exists." });
      return;
    }
    if (code === "P2003") {
      res.status(400).json({ ok: false, message: "Invalid foreign key (miner or event miner)." });
      return;
    }
    log.error("createDefinition", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to create daily task definition." });
  }
}

export async function patchDefinition(req: Request, res: Response): Promise<void> {
  try {
    const id = parsePositiveIntId(req.params.id);
    if (!id) {
      res.status(400).json({ ok: false, message: "Invalid task id." });
      return;
    }

    const parsed = parsePatchDailyTaskDefinition(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json({ ok: false, message: parsed.message });
      return;
    }

    const { data, needsMinerId, needsEventMinerId, needsOfferwallId } = parsed;

    if (needsMinerId != null) {
      const miner = await repo.findMinerById(needsMinerId);
      if (!miner) {
        res.status(400).json({ ok: false, message: "rewardMinerId does not exist." });
        return;
      }
    }

    if (needsEventMinerId != null) {
      const em = await repo.findEventMinerById(needsEventMinerId);
      if (!em) {
        res.status(400).json({ ok: false, message: "rewardEventMinerId does not exist." });
        return;
      }
    }

    if (needsOfferwallId != null) {
      const offer = await repo.findInternalOfferwallOfferById(needsOfferwallId);
      if (!offer) {
        res.status(400).json({ ok: false, message: "internalOfferwallOfferId does not exist." });
        return;
      }
    }

    const oldRow = await repo.findDailyTaskDefinitionById(id);
    if (!oldRow) {
      res.status(404).json({ ok: false, message: "Task definition not found." });
      return;
    }

    await repo.updateDailyTaskDefinition(id, data);
    const row = await repo.findDailyTaskDefinitionById(id);

    void logAdminAction({
      adminId: req.admin?.adminId,
      adminEmail: req.admin?.email,
      sessionId: req.admin?.sessionId,
      action: "TASK_DEFINITION_UPDATE",
      module: "tasks",
      resource: "daily_task_definitions",
      resourceId: String(id),
      oldValue: oldRow,
      newValue: row,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ ok: true, definition: row });
  } catch (e: unknown) {
    const code = prismaErrCode(e);
    if (code === "P2025") {
      res.status(404).json({ ok: false, message: "Task definition not found." });
      return;
    }
    if (code === "P2002") {
      res.status(409).json({ ok: false, message: "Slug already exists." });
      return;
    }
    log.error("patchDefinition", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to update daily task definition." });
  }
}

export async function deleteDefinition(req: Request, res: Response): Promise<void> {
  try {
    const id = parsePositiveIntId(req.params.id);
    if (!id) {
      res.status(400).json({ ok: false, message: "Invalid task id." });
      return;
    }

    const oldRow = await repo.findDailyTaskDefinitionById(id);
    if (!oldRow) {
      res.status(404).json({ ok: false, message: "Task definition not found." });
      return;
    }

    await repo.deleteDailyTaskDefinition(id);

    void logAdminAction({
      adminId: req.admin?.adminId,
      adminEmail: req.admin?.email,
      sessionId: req.admin?.sessionId,
      action: "TASK_DEFINITION_DELETE",
      module: "tasks",
      resource: "daily_task_definitions",
      resourceId: String(id),
      oldValue: oldRow,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ ok: true });
  } catch (e: unknown) {
    const code = prismaErrCode(e);
    if (code === "P2025") {
      res.status(404).json({ ok: false, message: "Task definition not found." });
      return;
    }
    log.error("deleteDefinition", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to delete daily task definition." });
  }
}
