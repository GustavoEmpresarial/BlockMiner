/**
 * Ported from legacy/server/modules/checkin/checkinMilestone.admin.controller.ts,
 * renamed per the Fase 4 plan ("checkin.admin.controller.ts", fusion of the
 * milestone admin CRUD).
 */
import type { Request, Response } from "express";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { logAdminAction } from "../admin/index.js";
import { assertMinerExistsForMilestone, parseMilestoneBody, REWARD_MACHINE } from "./checkin.milestones.js";
import { idParamSchema } from "./checkin.schemas.js";

const log = logger.child("checkin.admin.controller");

function getPrismaCode(e: unknown): string | undefined {
  if (e !== null && typeof e === "object" && "code" in e) {
    const c = (e as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

function isMissingMilestoneTablesError(e: unknown): boolean {
  const code = getPrismaCode(e);
  if (code === "P2021" || code === "P2010") return true;
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return /checkin_streak_milestones|user_checkin_streak_rewards|does not exist|relation.*does not exist/i.test(msg);
}

function parseMilestoneId(req: Request, res: Response): number | null {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: "Invalid milestone id." });
    return null;
  }
  return parsed.data.id;
}

function handleMilestoneError(res: Response, e: unknown, logName: string, defaultMessage: string): void {
  const code = getPrismaCode(e);
  if (code === "P2002") {
    res.status(400).json({ ok: false, message: "A milestone with this day threshold already exists." });
    return;
  }
  if (code === "P2025") {
    res.status(404).json({ ok: false, message: "Milestone not found." });
    return;
  }
  if (isMissingMilestoneTablesError(e)) {
    res.status(503).json({
      ok: false,
      code: "MILESTONE_DB_PENDING",
      message: "Check-in milestone tables are missing. Apply pending Prisma migrations on the server, then retry.",
    });
    return;
  }
  if (e instanceof Error && e.message && code === undefined) {
    res.status(400).json({ ok: false, message: e.message });
    return;
  }
  log.error(logName, { error: String(e) });
  res.status(500).json({ ok: false, message: defaultMessage });
}

async function findMilestoneOr404(req: Request, res: Response) {
  const id = parseMilestoneId(req, res);
  if (id === null) return null;
  const milestone = await prisma.checkinStreakMilestone.findUnique({ where: { id } });
  if (!milestone) {
    res.status(404).json({ ok: false, message: "Milestone not found." });
    return null;
  }
  return { id, milestone };
}

type MilestoneBody = Record<string, unknown>;

async function parseAndValidateBody(body: unknown) {
  const parsed = parseMilestoneBody(body);
  if (parsed.rewardType === REWARD_MACHINE && parsed.minerId) {
    await assertMinerExistsForMilestone(parsed.minerId);
  }
  return parsed;
}

export async function listCheckinMilestones(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await prisma.checkinStreakMilestone.findMany({
      orderBy: [{ sortOrder: "asc" }, { dayThreshold: "asc" }],
      include: { miner: { select: { id: true, name: true, baseHashRate: true, isActive: true, isArchived: true, imageUrl: true } } },
    });
    res.json({
      ok: true,
      milestones: rows.map((m) => ({
        ...m,
        rewardValue: Number(m.rewardValue),
        minerName: m.miner?.name ?? null,
        minerBaseHashRate: m.miner?.baseHashRate != null ? Number(m.miner.baseHashRate) : null,
        minerImageUrl: m.miner?.imageUrl ?? null,
      })),
    });
  } catch (e: unknown) {
    handleMilestoneError(res, e, "admin listCheckinMilestones", "Failed to list milestones.");
  }
}

export async function createCheckinMilestone(req: Request<unknown, unknown, MilestoneBody>, res: Response): Promise<void> {
  try {
    const data = await parseAndValidateBody(req.body);
    const row = await prisma.checkinStreakMilestone.create({ data });

    void logAdminAction({
      adminId: req.admin?.adminId ?? null,
      adminEmail: req.admin?.email ?? null,
      sessionId: req.admin?.sessionId ?? null,
      action: "ADMIN_CHECKIN_MILESTONE_CREATE",
      module: "checkin",
      resource: "CheckinStreakMilestone",
      resourceId: String(row.id),
      newValue: row,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });

    res.status(201).json({ ok: true, milestone: { ...row, rewardValue: Number(row.rewardValue) } });
  } catch (e: unknown) {
    handleMilestoneError(res, e, "admin createCheckinMilestone", "Failed to create milestone.");
  }
}

type IdParams = { id?: string };

export async function updateCheckinMilestone(req: Request<IdParams, unknown, MilestoneBody>, res: Response): Promise<void> {
  try {
    const target = await findMilestoneOr404(req, res);
    if (!target) return;
    const { id, milestone: existing } = target;

    const data = await parseAndValidateBody(req.body);
    const row = await prisma.checkinStreakMilestone.update({ where: { id }, data });

    void logAdminAction({
      adminId: req.admin?.adminId ?? null,
      adminEmail: req.admin?.email ?? null,
      sessionId: req.admin?.sessionId ?? null,
      action: "ADMIN_CHECKIN_MILESTONE_UPDATE",
      module: "checkin",
      resource: "CheckinStreakMilestone",
      resourceId: String(id),
      oldValue: existing,
      newValue: row,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });

    res.json({ ok: true, milestone: { ...row, rewardValue: Number(row.rewardValue) } });
  } catch (e: unknown) {
    handleMilestoneError(res, e, "admin updateCheckinMilestone", "Failed to update milestone.");
  }
}

export async function deleteCheckinMilestone(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const target = await findMilestoneOr404(req, res);
    if (!target) return;
    const { id, milestone: existing } = target;

    await prisma.checkinStreakMilestone.delete({ where: { id } });

    void logAdminAction({
      adminId: req.admin?.adminId ?? null,
      adminEmail: req.admin?.email ?? null,
      sessionId: req.admin?.sessionId ?? null,
      action: "ADMIN_CHECKIN_MILESTONE_DELETE",
      module: "checkin",
      resource: "CheckinStreakMilestone",
      resourceId: String(id),
      oldValue: existing,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });

    res.json({ ok: true });
  } catch (e: unknown) {
    handleMilestoneError(res, e, "admin deleteCheckinMilestone", "Failed to delete milestone.");
  }
}

/** GET /api/admin/checkin-streak-anomalies — ops monitor for grace/freeze collapses. */
export async function listCheckinStreakAnomalies(_req: Request, res: Response): Promise<void> {
  try {
    const { scanRecentStreakAnomalies } = await import("./checkin.monitor.js");
    const anomalies = await scanRecentStreakAnomalies();
    res.json({ ok: true, anomalyCount: anomalies.length, anomalies });
  } catch (e: unknown) {
    log.error("admin listCheckinStreakAnomalies", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to scan streak anomalies." });
  }
}
