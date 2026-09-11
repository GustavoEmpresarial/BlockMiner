/**
 * Lean admin miners catalog — list/create/update/toggle for Prisma Miner model.
 * Paths: /api/admin/miners* (mounted bare on /api/admin).
 */
import express from "express";
import type { Request, Response } from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { logAdminAction } from "../admin/admin.audit-log.service.js";
import {
  assignCatalogMinerToBrokenGroup,
  assignEventMinerToBrokenGroup,
  autoAssignBrokenMachines,
  listBrokenMachineGroups,
  listOrphanMachineTypes,
  relinkOrphanMachineTypeToCatalog,
} from "./miners.admin.repair.js";

export const minersAdminRouter = express.Router();
const log = logger.child("AdminMiners");

minersAdminRouter.use(requireAdminAuth);

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || `miner-${Date.now()}`;
}

minersAdminRouter.get("/miners", async (req: Request, res: Response) => {
  try {
    const includeArchived = String(req.query.includeArchived ?? "") === "1";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const where: Record<string, unknown> = includeArchived ? {} : { isArchived: false };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
      ];
    }
    const miners = await prisma.miner.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    res.json({ ok: true, miners, total: miners.length });
  } catch (error) {
    log.error("list", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Unable to list miners." });
  }
});

minersAdminRouter.get("/miners/orphan-types", async (_req: Request, res: Response) => {
  try {
    const orphanTypes = await listOrphanMachineTypes(prisma);
    res.json({ ok: true, orphanTypes });
  } catch (error) {
    log.error("list-orphan-types", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Unable to list orphan machine types." });
  }
});

minersAdminRouter.post("/miners/orphan-types/relink", async (req: Request, res: Response) => {
  try {
    const minerName = typeof req.body?.minerName === "string" ? req.body.minerName.trim() : "";
    if (!minerName) {
      res.status(400).json({ ok: false, message: "minerName required." });
      return;
    }
    const result = await relinkOrphanMachineTypeToCatalog(prisma, minerName);
    if (result.ok) {
      await logAdminAction({
        adminId: req.admin?.adminId ?? null,
        action: "ADMIN_MINER_ORPHAN_RELINK",
        module: "miners",
        resource: "Miner",
        resourceId: result.catalogMinerId ? String(result.catalogMinerId) : null,
        newValue: { minerName, counts: result.counts },
      });
    }
    res.status(result.ok ? 200 : 404).json(result);
  } catch (error) {
    log.error("relink-orphan-type", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Unable to relink orphan machine type." });
  }
});

minersAdminRouter.get("/miners/broken-machines", async (_req: Request, res: Response) => {
  try {
    const brokenMachines = await listBrokenMachineGroups(prisma);
    res.json({ ok: true, brokenMachines });
  } catch (error) {
    log.error("list-broken-machines", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Unable to list broken machines." });
  }
});

minersAdminRouter.post("/miners/broken-machines/assign", async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const minerName = typeof body.minerName === "string" ? body.minerName.trim() : "";
    const hashRate = Number(body.hashRate);
    const location = typeof body.location === "string" ? body.location : "";
    const catalogMinerId = Number(body.catalogMinerId);
    const eventMinerId = Number(body.eventMinerId);
    if (!minerName || !Number.isFinite(hashRate) || !["RACK", "INVENTORY", "WAREHOUSE"].includes(location)) {
      res.status(400).json({ ok: false, message: "minerName, hashRate, and a valid location are required." });
      return;
    }
    if ((Number.isSafeInteger(catalogMinerId) && catalogMinerId > 0) === (Number.isSafeInteger(eventMinerId) && eventMinerId > 0)) {
      res.status(400).json({ ok: false, message: "Provide exactly one catalogMinerId or eventMinerId." });
      return;
    }
    const result = Number.isSafeInteger(catalogMinerId) && catalogMinerId > 0
      ? await assignCatalogMinerToBrokenGroup(prisma, { minerName, hashRate, location, catalogMinerId })
      : await assignEventMinerToBrokenGroup(prisma, { minerName, hashRate, location, eventMinerId });
    if (result.ok) {
      await logAdminAction({
        adminId: req.admin?.adminId ?? null,
        action: "ADMIN_BROKEN_MACHINES_ASSIGN",
        module: "miners",
        resource: "UserOwnedMachine",
        newValue: { minerName, hashRate, location, catalogMinerId: catalogMinerId || null, eventMinerId: eventMinerId || null, assigned: result.assigned },
      });
    }
    res.status(result.ok ? 200 : 404).json(result);
  } catch (error) {
    log.error("assign-broken-machines", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Unable to assign broken machines." });
  }
});

minersAdminRouter.post("/miners/broken-machines/auto-assign", async (req: Request, res: Response) => {
  try {
    const result = await autoAssignBrokenMachines(prisma);
    res.status(403).json(result);
  } catch (error) {
    log.error("auto-assign-broken-machines", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Unable to auto-assign broken machines." });
  }
});

minersAdminRouter.get("/miners/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    const miner = await prisma.miner.findUnique({ where: { id } });
    if (!miner) {
      res.status(404).json({ ok: false, message: "Not found." });
      return;
    }
    res.json({ ok: true, miner });
  } catch (error) {
    log.error("get", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Unable to load miner." });
  }
});

minersAdminRouter.post("/miners", async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) {
      res.status(400).json({ ok: false, message: "name required." });
      return;
    }
    const slug = String(body.slug ?? "").trim() || slugify(name);
    const miner = await prisma.miner.create({
      data: {
        name,
        slug,
        description: typeof body.description === "string" ? body.description : null,
        baseHashRate: Number(body.baseHashRate ?? 0) || 0,
        price: Number(body.price ?? 0.5) || 0.5,
        slotSize: Math.max(1, Number(body.slotSize ?? 1) || 1),
        imageUrl: typeof body.imageUrl === "string" ? body.imageUrl.slice(0, 500) : null,
        tier: typeof body.tier === "string" ? body.tier : "common",
        sourceType: typeof body.sourceType === "string" ? body.sourceType : "store",
        isActive: body.isActive !== false,
        showInShop: body.showInShop !== false,
        sortOrder: Number(body.sortOrder ?? 0) || 0,
      },
    });
    await logAdminAction({
      adminId: req.admin?.adminId ?? null,
      action: "ADMIN_MINER_CREATE",
      module: "miners",
      resource: "Miner",
      resourceId: String(miner.id),
    });
    res.json({ ok: true, miner });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("Unique constraint")) {
      res.status(409).json({ ok: false, message: "Slug already in use." });
      return;
    }
    log.error("create", { error: msg });
    res.status(500).json({ ok: false, message: "Unable to create miner." });
  }
});

minersAdminRouter.patch("/miners/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    for (const key of [
      "name",
      "slug",
      "description",
      "imageUrl",
      "tier",
      "sourceType",
    ] as const) {
      if (typeof body[key] === "string") data[key] = body[key];
    }
    for (const key of ["baseHashRate", "price", "slotSize", "sortOrder"] as const) {
      if (body[key] != null && Number.isFinite(Number(body[key]))) data[key] = Number(body[key]);
    }
    for (const key of ["isActive", "showInShop", "isArchived"] as const) {
      if (typeof body[key] === "boolean") data[key] = body[key];
    }
    const miner = await prisma.miner.update({ where: { id }, data });
    await logAdminAction({
      adminId: req.admin?.adminId ?? null,
      action: "ADMIN_MINER_UPDATE",
      module: "miners",
      resource: "Miner",
      resourceId: String(id),
    });
    res.json({ ok: true, miner });
  } catch (error) {
    log.error("update", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Unable to update miner." });
  }
});

minersAdminRouter.post("/miners/:id/toggle-active", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    const current = await prisma.miner.findUnique({ where: { id }, select: { isActive: true } });
    if (!current) {
      res.status(404).json({ ok: false, message: "Not found." });
      return;
    }
    const miner = await prisma.miner.update({
      where: { id },
      data: { isActive: !current.isActive },
    });
    res.json({ ok: true, miner });
  } catch (error) {
    log.error("toggle", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Unable to toggle miner." });
  }
});

minersAdminRouter.post("/miners/:id/toggle-store", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    const current = await prisma.miner.findUnique({ where: { id }, select: { showInShop: true } });
    if (!current) {
      res.status(404).json({ ok: false, message: "Not found." });
      return;
    }
    const miner = await prisma.miner.update({
      where: { id },
      data: { showInShop: !current.showInShop },
    });
    res.json({ ok: true, miner });
  } catch (error) {
    log.error("toggle-store", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Unable to toggle store visibility." });
  }
});
