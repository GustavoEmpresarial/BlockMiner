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
import {
  minerIdParamSchema,
  createMinerSchema,
  updateMinerSchema,
  relinkOrphanSchema,
  assignBrokenMachineSchema,
  minerListQuerySchema,
} from "./miners.schemas.js";

export const minersAdminRouter = express.Router();
const log = logger.child("AdminMiners");

minersAdminRouter.use(requireAdminAuth);

function slugify(raw: string): string {
  return (
    raw
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || `miner-${Date.now()}`
  );
}

function parseMinerId(req: Request, res: Response): number | null {
  const parsed = minerIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid id." });
    return null;
  }
  return parsed.data.id;
}

async function toggleMinerBoolean(
  id: number,
  field: "isActive" | "showInShop",
  actionName: string,
  req: Request,
  res: Response,
): Promise<void> {
  const current = await prisma.miner.findUnique({ where: { id }, select: { [field]: true } });
  if (!current) {
    res.status(404).json({ ok: false, message: "Not found." });
    return;
  }
  const nextVal = !(current as Record<string, boolean>)[field];
  const miner = await prisma.miner.update({
    where: { id },
    data: { [field]: nextVal },
  });
  await logAdminAction({
    adminId: req.admin?.adminId ?? null,
    action: actionName,
    module: "miners",
    resource: "Miner",
    resourceId: String(id),
    newValue: { [field]: nextVal },
  });
  res.json({ ok: true, miner });
}

minersAdminRouter.get("/miners", async (req: Request, res: Response) => {
  try {
    const qParse = minerListQuerySchema.safeParse(req.query);
    const includeArchived = qParse.success ? Boolean(qParse.data.includeArchived) : false;
    const q = qParse.success && qParse.data.q ? qParse.data.q : "";

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
    const parsed = relinkOrphanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: parsed.error.issues[0]?.message ?? "minerName required." });
      return;
    }
    const result = await relinkOrphanMachineTypeToCatalog(prisma, parsed.data.minerName);
    if (result.ok) {
      await logAdminAction({
        adminId: req.admin?.adminId ?? null,
        action: "ADMIN_MINER_ORPHAN_RELINK",
        module: "miners",
        resource: "Miner",
        resourceId: result.catalogMinerId ? String(result.catalogMinerId) : null,
        newValue: { minerName: parsed.data.minerName, counts: result.counts },
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
    const parsed = assignBrokenMachineSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid broken machine assignment payload." });
      return;
    }
    const { minerName, hashRate, location, catalogMinerId, eventMinerId } = parsed.data;
    const result =
      Number.isSafeInteger(catalogMinerId) && (catalogMinerId ?? 0) > 0
        ? await assignCatalogMinerToBrokenGroup(prisma, { minerName, hashRate, location, catalogMinerId: catalogMinerId! })
        : await assignEventMinerToBrokenGroup(prisma, { minerName, hashRate, location, eventMinerId: eventMinerId! });

    if (result.ok) {
      await logAdminAction({
        adminId: req.admin?.adminId ?? null,
        action: "ADMIN_BROKEN_MACHINES_ASSIGN",
        module: "miners",
        resource: "UserOwnedMachine",
        newValue: {
          minerName,
          hashRate,
          location,
          catalogMinerId: catalogMinerId || null,
          eventMinerId: eventMinerId || null,
          assigned: result.assigned,
        },
      });
    }
    res.status(result.ok ? 200 : 404).json(result);
  } catch (error) {
    log.error("assign-broken-machines", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Unable to assign broken machines." });
  }
});

minersAdminRouter.post("/miners/broken-machines/auto-assign", async (_req: Request, res: Response) => {
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
    const id = parseMinerId(req, res);
    if (id == null) return;

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
    const parsed = createMinerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid miner data." });
      return;
    }
    const data = parsed.data;
    const slug = data.slug || slugify(data.name);

    const miner = await prisma.miner.create({
      data: {
        name: data.name,
        slug,
        description: data.description ?? null,
        baseHashRate: data.baseHashRate,
        price: data.price,
        slotSize: data.slotSize,
        imageUrl: data.imageUrl ?? null,
        tier: data.tier,
        sourceType: data.sourceType,
        isActive: data.isActive,
        showInShop: data.showInShop,
        sortOrder: data.sortOrder,
      },
    });

    await logAdminAction({
      adminId: req.admin?.adminId ?? null,
      action: "ADMIN_MINER_CREATE",
      module: "miners",
      resource: "Miner",
      resourceId: String(miner.id),
      newValue: { name: miner.name, slug: miner.slug, baseHashRate: miner.baseHashRate },
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

async function handleUpdateMiner(req: Request, res: Response): Promise<void> {
  try {
    const id = parseMinerId(req, res);
    if (id == null) return;

    const parsed = updateMinerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid update payload." });
      return;
    }
    const data = parsed.data;
    const existing = await prisma.miner.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, message: "Miner not found." });
      return;
    }

    const miner = await prisma.miner.update({ where: { id }, data });
    await logAdminAction({
      adminId: req.admin?.adminId ?? null,
      action: "ADMIN_MINER_UPDATE",
      module: "miners",
      resource: "Miner",
      resourceId: String(id),
      previousValue: { name: existing.name, baseHashRate: existing.baseHashRate, price: existing.price },
      newValue: data,
    });
    res.json({ ok: true, miner });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("Unique constraint")) {
      res.status(409).json({ ok: false, message: "Slug already in use." });
      return;
    }
    log.error("update", { error: msg });
    res.status(500).json({ ok: false, message: "Unable to update miner." });
  }
}

minersAdminRouter.patch("/miners/:id", handleUpdateMiner);
minersAdminRouter.put("/miners/:id", handleUpdateMiner);

minersAdminRouter.post("/miners/:id/toggle-active", async (req: Request, res: Response) => {
  try {
    const id = parseMinerId(req, res);
    if (id == null) return;
    await toggleMinerBoolean(id, "isActive", "ADMIN_MINER_TOGGLE_ACTIVE", req, res);
  } catch (error) {
    log.error("toggle", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Unable to toggle miner." });
  }
});

minersAdminRouter.post("/miners/:id/toggle-store", async (req: Request, res: Response) => {
  try {
    const id = parseMinerId(req, res);
    if (id == null) return;
    await toggleMinerBoolean(id, "showInShop", "ADMIN_MINER_TOGGLE_STORE", req, res);
  } catch (error) {
    log.error("toggle-store", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Unable to toggle store visibility." });
  }
});
