/**
 * Lean admin sala API — rooms/slots/racks without image upload middleware.
 * Mounted at /api/admin/sala.
 */
import express from "express";
import type { Request, Response } from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";

export const salaAdminRouter = express.Router();
const log = logger.child("AdminSala");
const ROOM_COUNT = 8;

salaAdminRouter.use(requireAdminAuth);

async function ensureRooms() {
  const existing = await prisma.salaCanvas.findMany();
  const have = new Set(existing.map((r) => r.roomNumber));
  for (let n = 1; n <= ROOM_COUNT; n++) {
    if (!have.has(n)) {
      await prisma.salaCanvas.create({ data: { roomNumber: n } });
    }
  }
  return prisma.salaCanvas.findMany({ orderBy: { roomNumber: "asc" } });
}

salaAdminRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const [rooms, slots, racks] = await Promise.all([
      ensureRooms(),
      prisma.salaSlot.findMany({ orderBy: [{ roomNumber: "asc" }, { sortOrder: "asc" }, { id: "asc" }] }),
      prisma.salaRack.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    ]);
    res.json({ ok: true, rooms, slots, racks });
  } catch (error) {
    log.error("get", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao carregar sala (admin)." });
  }
});

salaAdminRouter.put("/canvas", async (req: Request, res: Response) => {
  try {
    const roomNumber = Math.min(ROOM_COUNT, Math.max(1, Number(req.body?.roomNumber) || 1));
    await ensureRooms();
    const gridWidth = Math.min(48, Math.max(1, Number(req.body?.gridWidth) || 12));
    const gridHeight = Math.min(48, Math.max(1, Number(req.body?.gridHeight) || 8));
    const bgImageUrl =
      req.body?.bgImageUrl === undefined
        ? undefined
        : req.body.bgImageUrl === null || req.body.bgImageUrl === ""
          ? null
          : String(req.body.bgImageUrl).slice(0, 500);
    const canvas = await prisma.salaCanvas.update({
      where: { roomNumber },
      data: {
        gridWidth,
        gridHeight,
        ...(bgImageUrl !== undefined ? { bgImageUrl } : {}),
      },
    });
    res.json({ ok: true, canvas });
  } catch (error) {
    log.error("canvas", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao salvar canvas." });
  }
});

salaAdminRouter.put("/slots", async (req: Request, res: Response) => {
  try {
    const roomNumber = Math.min(ROOM_COUNT, Math.max(1, Number(req.body?.roomNumber) || 1));
    await ensureRooms();
    const raw = Array.isArray(req.body?.slots) ? req.body.slots : [];
    const clamp01 = (v: unknown, fallback: number) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(0, Math.min(1, n));
    };
    const clean = raw.map((s: Record<string, unknown>, i: number) => {
      const wPct = Math.max(0.02, clamp01(s.wPct, 0.08));
      const hPct = Math.max(0.03, clamp01(s.hPct, 0.16));
      const xPct = Math.max(0, Math.min(1 - wPct, clamp01(s.xPct, 0.4)));
      const yPct = Math.max(0, Math.min(1 - hPct, clamp01(s.yPct, 0.4)));
      return { roomNumber, xPct, yPct, wPct, hPct, sortOrder: i };
    });
    await prisma.$transaction([
      prisma.salaSlot.deleteMany({ where: { roomNumber } }),
      ...(clean.length ? [prisma.salaSlot.createMany({ data: clean })] : []),
    ]);
    const slots = await prisma.salaSlot.findMany({
      orderBy: [{ roomNumber: "asc" }, { yPct: "asc" }, { id: "asc" }],
    });
    res.json({ ok: true, slots });
  } catch (error) {
    log.error("slots", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao salvar slots." });
  }
});

salaAdminRouter.post("/racks", async (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const imageUrl = String(req.body?.imageUrl ?? "").trim();
    if (!name || !imageUrl) {
      res.status(400).json({ ok: false, message: "name and imageUrl required." });
      return;
    }
    const max = await prisma.salaRack.aggregate({ _max: { sortOrder: true } });
    const rack = await prisma.salaRack.create({
      data: {
        name: name.slice(0, 120),
        imageUrl: imageUrl.slice(0, 500),
        hashRate: Number(req.body?.hashRate) || 0,
        width: Math.min(4, Math.max(1, Number(req.body?.width) || 1)),
        height: Math.min(4, Math.max(1, Number(req.body?.height) || 1)),
        slotCount: Math.min(24, Math.max(1, Number(req.body?.slotCount) || 4)),
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
    res.json({ ok: true, rack });
  } catch (error) {
    log.error("create rack", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao criar rack." });
  }
});

salaAdminRouter.patch("/racks/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") data.name = body.name.slice(0, 120);
    if (typeof body.imageUrl === "string" && body.imageUrl.trim()) data.imageUrl = body.imageUrl.slice(0, 500);
    if (body.hashRate != null) data.hashRate = Number(body.hashRate) || 0;
    if (body.width != null) data.width = Math.min(4, Math.max(1, Number(body.width) || 1));
    if (body.height != null) data.height = Math.min(4, Math.max(1, Number(body.height) || 1));
    if (body.slotCount != null) data.slotCount = Math.min(24, Math.max(1, Number(body.slotCount) || 4));
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    const rack = await prisma.salaRack.update({ where: { id }, data });
    res.json({ ok: true, rack });
  } catch (error) {
    log.error("update rack", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao atualizar rack." });
  }
});

salaAdminRouter.delete("/racks/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    await prisma.salaRack.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    log.error("delete rack", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao apagar rack." });
  }
});

/** Replace a rack's internal miner-bay layout (positions inside the rack artwork). */
function parseMinerSlots(raw: unknown): Array<{ x: number; y: number; w: number; h: number }> {
  if (!Array.isArray(raw)) return [];
  const clamp01 = (v: unknown) => Math.max(0, Math.min(1, Number(v) || 0));
  return raw
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .slice(0, 24)
    .map((s) => ({ x: clamp01(s.x), y: clamp01(s.y), w: clamp01(s.w), h: clamp01(s.h) }));
}

salaAdminRouter.put("/racks/:id/miner-slots", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    const clean = parseMinerSlots(req.body?.slots ?? req.body);
    const rack = await prisma.salaRack.update({
      where: { id },
      data: { minerSlots: clean },
    });
    res.json({ ok: true, rack });
  } catch (error) {
    log.error("miner-slots", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Erro ao salvar posições dos miners." });
  }
});
