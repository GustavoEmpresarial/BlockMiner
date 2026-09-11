// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Ported from legacy/server/modules/faucet/faucet.admin.routes.ts. Full paths /api/admin/faucet/config unchanged. */
import express from "express";
import prisma from "../../core/database/prisma.js";
import { requireAdminAuth } from "../admin/index.js";
import { logger } from "../../core/logger/index.js";
const log = logger.child("faucet.admin.routes");
export const faucetAdminRouter = express.Router();
faucetAdminRouter.use(requireAdminAuth);
faucetAdminRouter.get("/faucet/config", async (_req, res) => {
    try {
        const reward = await prisma.faucetReward.findFirst({ where: { isActive: true }, include: { miner: true }, orderBy: { id: "asc" } });
        if (!reward?.miner) {
            res.json({ ok: true, configured: false, reward: null });
            return;
        }
        res.json({
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
        });
    }
    catch (error) {
        log.error("faucet/config get failed", { error: String(error) });
        res.status(500).json({ ok: false, message: "Falha ao carregar config da faucet." });
    }
});
faucetAdminRouter.put("/faucet/config", async (req, res) => {
    try {
        const reward = await prisma.faucetReward.findFirst({ where: { isActive: true }, include: { miner: true }, orderBy: { id: "asc" } });
        if (!reward?.miner) {
            res.status(404).json({ ok: false, message: "Nenhuma faucet ativa configurada." });
            return;
        }
        const { baseHashRate, imageUrl, cooldownMs, name } = (req.body || {});
        const minerData = {};
        if (name !== undefined && String(name).trim())
            minerData.name = String(name).trim();
        if (baseHashRate !== undefined) {
            const v = Number(baseHashRate);
            if (!Number.isFinite(v) || v < 0) {
                res.status(400).json({ ok: false, message: "baseHashRate inválido." });
                return;
            }
            minerData.baseHashRate = v;
        }
        if (imageUrl !== undefined) {
            const u = String(imageUrl).trim();
            minerData.imageUrl = u || null;
        }
        const rewardData = {};
        if (cooldownMs !== undefined) {
            const c = Number(cooldownMs);
            if (!Number.isFinite(c) || c < 0) {
                res.status(400).json({ ok: false, message: "cooldownMs inválido." });
                return;
            }
            rewardData.cooldownMs = Math.floor(c);
        }
        if (!Object.keys(minerData).length && !Object.keys(rewardData).length) {
            res.status(400).json({ ok: false, message: "Nenhum campo para atualizar." });
            return;
        }
        await prisma.$transaction(async (tx) => {
            if (Object.keys(minerData).length)
                await tx.miner.update({ where: { id: reward.miner.id }, data: minerData });
            if (Object.keys(rewardData).length)
                await tx.faucetReward.update({ where: { id: reward.id }, data: rewardData });
        });
        const fresh = await prisma.faucetReward.findUnique({ where: { id: reward.id }, include: { miner: true } });
        if (!fresh?.miner) {
            res.status(500).json({ ok: false, message: "Falha ao recarregar config da faucet." });
            return;
        }
        res.json({
            ok: true,
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
        });
    }
    catch (error) {
        log.error("faucet/config put failed", { error: String(error) });
        res.status(500).json({ ok: false, message: "Falha ao atualizar config da faucet." });
    }
});
