import express from "express";
import prisma from "../../core/database/prisma.js";
import { requireAdminAuth, requireAdminPermission } from "../admin/index.js";
import { logAdminAction } from "../admin/admin.audit-log.service.js";
import { logger } from "../../core/logger/index.js";
import { adminFaucetConfigUpdateSchema } from "./faucet.admin.schemas.js";
import type {
  AdminFaucetConfigResponse,
  AdminFaucetConfigUpdateResponse,
} from "./faucet.types.js";

const log = logger.child("faucet.admin.routes");

export const faucetAdminRouter = express.Router();

faucetAdminRouter.use(requireAdminAuth);

/**
 * GET /api/admin/faucet/config
 * Requires faucet.view or faucet permission.
 */
faucetAdminRouter.get(
  "/faucet/config",
  requireAdminPermission("faucet.view", "faucet"),
  async (_req, res) => {
    try {
      const reward = await prisma.faucetReward.findFirst({
        where: { isActive: true },
        include: { miner: true },
        orderBy: { id: "asc" },
      });

      if (!reward?.miner) {
        const response: AdminFaucetConfigResponse = { ok: true, configured: false, reward: null };
        res.json(response);
        return;
      }

      const response: AdminFaucetConfigResponse = {
        ok: true,
        configured: true,
        reward: {
          rewardId: reward.id,
          cooldownMs: reward.cooldownMs,
          isActive: reward.isActive,
          miner: {
            id: reward.miner.id,
            slug: reward.miner.slug,
            name: reward.miner.name,
            baseHashRate: reward.miner.baseHashRate,
            slotSize: reward.miner.slotSize,
            imageUrl: reward.miner.imageUrl,
          },
        },
      };

      res.json(response);
    } catch (error: unknown) {
      log.error("faucet/config get failed", { error: String(error) });
      res.status(500).json({ ok: false, code: "FAUCET_LOAD_FAILED", message: "Falha ao carregar config da faucet." });
    }
  },
);

/**
 * PUT /api/admin/faucet/config
 * Requires faucet permission (write).
 */
faucetAdminRouter.put(
  "/faucet/config",
  requireAdminPermission("faucet"),
  async (req, res) => {
    try {
      const parsed = adminFaucetConfigUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        res.status(400).json({
          ok: false,
          code: "FAUCET_VALIDATION_ERROR",
          message: firstIssue?.message || "Dados inválidos.",
          errors: parsed.error.issues,
        });
        return;
      }

      const reward = await prisma.faucetReward.findFirst({
        where: { isActive: true },
        include: { miner: true },
        orderBy: { id: "asc" },
      });

      if (!reward?.miner) {
        res.status(404).json({
          ok: false,
          code: "FAUCET_NOT_FOUND",
          message: "Nenhuma faucet ativa configurada.",
        });
        return;
      }

      const { name, baseHashRate, imageUrl, cooldownMs, isActive } = parsed.data;

      const minerData: Record<string, unknown> = {};
      if (name !== undefined) minerData.name = name;
      if (baseHashRate !== undefined) minerData.baseHashRate = baseHashRate;
      if (imageUrl !== undefined) minerData.imageUrl = imageUrl;

      const rewardData: Record<string, unknown> = {};
      if (cooldownMs !== undefined) rewardData.cooldownMs = cooldownMs;
      if (isActive !== undefined) rewardData.isActive = isActive;

      const oldState = {
        cooldownMs: reward.cooldownMs,
        isActive: reward.isActive,
        minerName: reward.miner.name,
        baseHashRate: reward.miner.baseHashRate,
        imageUrl: reward.miner.imageUrl,
      };

      await prisma.$transaction(async (tx) => {
        if (Object.keys(minerData).length > 0) {
          await tx.miner.update({
            where: { id: reward.miner.id },
            data: minerData,
          });
        }
        if (Object.keys(rewardData).length > 0) {
          await tx.faucetReward.update({
            where: { id: reward.id },
            data: rewardData,
          });
        }
      });

      const fresh = await prisma.faucetReward.findUnique({
        where: { id: reward.id },
        include: { miner: true },
      });

      if (!fresh?.miner) {
        res.status(500).json({
          ok: false,
          code: "FAUCET_RELOAD_FAILED",
          message: "Falha ao recarregar config da faucet.",
        });
        return;
      }

      const newState = {
        cooldownMs: fresh.cooldownMs,
        isActive: fresh.isActive,
        minerName: fresh.miner.name,
        baseHashRate: fresh.miner.baseHashRate,
        imageUrl: fresh.miner.imageUrl,
      };

      const adminUser = (req as unknown as { admin?: { id?: number; adminId?: number; email?: string } }).admin;
      const adminId = adminUser?.adminId ?? adminUser?.id ?? null;

      void logAdminAction({
        adminId,
        adminEmail: adminUser?.email,
        action: "admin_faucet_config_updated",
        module: "faucet",
        resource: "faucet_reward",
        resourceId: String(fresh.id),
        oldValue: oldState,
        newValue: newState,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || null,
        success: true,
      }).catch((auditErr: unknown) => {
        log.warn("admin_audit_log failed for faucet update", { error: String(auditErr) });
      });

      const response: AdminFaucetConfigUpdateResponse = {
        ok: true,
        message: "Configuração da faucet atualizada com sucesso.",
        reward: {
          rewardId: fresh.id,
          cooldownMs: fresh.cooldownMs,
          isActive: fresh.isActive,
          miner: {
            id: fresh.miner.id,
            slug: fresh.miner.slug,
            name: fresh.miner.name,
            baseHashRate: fresh.miner.baseHashRate,
            slotSize: fresh.miner.slotSize,
            imageUrl: fresh.miner.imageUrl,
          },
        },
      };

      res.json(response);
    } catch (error: unknown) {
      log.error("faucet/config put failed", { error: String(error) });
      res.status(500).json({
        ok: false,
        code: "FAUCET_UPDATE_FAILED",
        message: "Falha ao atualizar config da faucet.",
      });
    }
  },
);
