import express, { type Request, type Response, type Router } from "express";
import { z } from "zod";
import { requireAdminAuth, logAdminAction } from "../admin/index.js";
import { requireAdminPermission } from "../admin/admin.permissions.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import { getClientIp } from "../../shared/http/clientIp.js";
import { logger } from "../../core/logger/index.js";
import { removeAvatarPhoto } from "./avatar.service.js";

const log = logger.child("AvatarAdmin");
export const avatarAdminRouter: Router = express.Router();

const writeLimiter = createDistributedRateLimiter({ windowMs: 60_000, max: 30, name: "avatar_admin_write" });
const bodySchema = z.object({ block: z.boolean().optional() }).strict();

/** Removes a user's photo (license stays valid); `block: true` also stops further uploads. */
avatarAdminRouter.delete(
  "/users/:id/avatar",
  requireAdminAuth,
  writeLimiter,
  requireAdminPermission("users.ban", "users"),
  async (req: Request, res: Response) => {
    const userId = Number.parseInt(String(req.params.id), 10);
    const body = bodySchema.safeParse(req.body ?? {});
    if (!Number.isInteger(userId) || userId <= 0 || !body.success) {
      res.status(400).json({ ok: false, code: "VALIDATION_ERROR", message: "Invalid request." });
      return;
    }
    const admin = (req as Request & { admin?: { adminId?: number; email?: string; sessionId?: string } }).admin;
    try {
      const { previousPath } = await removeAvatarPhoto(userId, { block: body.data.block });
      void logAdminAction({
        adminId: typeof admin?.adminId === "number" ? admin.adminId : null,
        adminEmail: admin?.email ?? null,
        sessionId: admin?.sessionId ?? null,
        action: "ADMIN_REMOVE_AVATAR",
        module: "users",
        resource: "User",
        resourceId: String(userId),
        oldValue: { path: previousPath },
        newValue: { path: null, uploadBlocked: body.data.block ?? null },
        ipAddress: getClientIp(req),
        userAgent: String(req.headers["user-agent"] ?? ""),
      });
      log.info("avatar.photo.removed_by_admin", { userId, adminId: admin?.adminId ?? null, blocked: body.data.block ?? null });
      res.json({ ok: true });
    } catch (err) {
      log.error("AVATAR_ADMIN_REMOVE_FAILED", { userId, error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ ok: false, code: "AVATAR_ADMIN_REMOVE_FAILED", message: "Unable to remove avatar." });
    }
  },
);
