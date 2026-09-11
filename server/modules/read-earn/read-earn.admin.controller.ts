// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import * as readEarnAdminRepo from "./read-earn.admin.repository.js";
import { logger } from "../../core/logger/index.js";
import { READ_EARN_MACHINE } from "./read-earn.errors.js";
import { parseReadEarnCreate, parseReadEarnUpdate } from "./read-earn.schemas.js";
import { hashReadEarnCode } from "./read-earn.service.js";
const log = logger.child("read-earn.admin.controller");
function isMissingReadEarnTablesError(e) {
    if (e === null || typeof e !== "object")
        return false;
    const o = e;
    if (o.code === "P2021" || o.code === "P2010")
        return true;
    const msg = String(o.message ?? "");
    return /read_earn_campaigns|read_earn_redemptions|does not exist|relation.*does not exist/i.test(msg);
}
function errCode(e) {
    if (e !== null && typeof e === "object" && "code" in e) {
        const c = e.code;
        if (typeof c === "string")
            return c;
    }
    return undefined;
}
function mapCampaign(row) {
    if (!row || typeof row !== "object")
        return null;
    const r = row;
    const redemptionCount = r._count?.redemptions ?? r.redemptionCount ?? 0;
    return {
        id: r.id, title: r.title, partnerUrl: r.partnerUrl, rewardType: r.rewardType, rewardAmount: Number(r.rewardAmount),
        rewardMinerId: r.rewardMinerId, hashrateValidityDays: r.hashrateValidityDays, startsAt: r.startsAt, expiresAt: r.expiresAt,
        isActive: r.isActive, maxRedemptions: r.maxRedemptions, sortOrder: r.sortOrder, redemptionCount, createdAt: r.createdAt, updatedAt: r.updatedAt,
    };
}
function respondMissingTables(res) {
    res.status(503).json({ ok: false, code: "READ_EARN_DB_PENDING", message: "Read & Earn tables are missing. Apply pending Prisma migrations, then retry." });
}
export async function adminListReadEarnCampaigns(_req, res) {
    try {
        const rows = await readEarnAdminRepo.listCampaigns();
        res.json({ ok: true, campaigns: rows.map(mapCampaign) });
    }
    catch (e) {
        log.error("adminListReadEarnCampaigns failed", { error: String(e) });
        if (isMissingReadEarnTablesError(e))
            return respondMissingTables(res);
        res.status(500).json({ ok: false, message: "Failed to list campaigns." });
    }
}
export async function adminCreateReadEarnCampaign(req, res) {
    try {
        const data = parseReadEarnCreate(req.body || {});
        const codeHash = await hashReadEarnCode(data.rewardCode);
        const row = await readEarnAdminRepo.createCampaign({
            title: data.title,
            partnerUrl: data.partnerUrl,
            codeHash,
            rewardType: data.rewardType,
            rewardAmount: new Prisma.Decimal(String(data.rewardAmount)),
            rewardMinerId: data.rewardMinerId ?? null,
            hashrateValidityDays: data.hashrateValidityDays,
            startsAt: data.startsAt,
            expiresAt: data.expiresAt,
            maxRedemptions: data.maxRedemptions ?? null,
            sortOrder: data.sortOrder,
            isActive: data.isActive,
        });
        res.json({ ok: true, campaign: mapCampaign(row) });
    }
    catch (e) {
        if (e instanceof ZodError) {
            res.status(400).json({ ok: false, message: e.issues?.[0]?.message || "Validation failed." });
            return;
        }
        if (isMissingReadEarnTablesError(e))
            return respondMissingTables(res);
        log.error("adminCreateReadEarnCampaign failed", { error: String(e) });
        res.status(500).json({ ok: false, message: "Failed to create campaign." });
    }
}
export async function adminUpdateReadEarnCampaign(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id < 1) {
            res.status(400).json({ ok: false, message: "Invalid campaign id." });
            return;
        }
        const data = parseReadEarnUpdate(req.body || {});
        const existing = await readEarnAdminRepo.findCampaignById(id);
        if (!existing) {
            res.status(404).json({ ok: false, message: "Campaign not found." });
            return;
        }
        const startsAt = data.startsAt ?? existing.startsAt;
        const expiresAt = data.expiresAt ?? existing.expiresAt;
        if (expiresAt <= startsAt) {
            res.status(400).json({ ok: false, message: "expiresAt must be after startsAt." });
            return;
        }
        const rewardType = data.rewardType ?? existing.rewardType;
        const rewardMinerId = data.rewardMinerId !== undefined ? data.rewardMinerId : existing.rewardMinerId;
        if (String(rewardType).toLowerCase() === READ_EARN_MACHINE && !rewardMinerId) {
            res.status(400).json({ ok: false, message: "rewardMinerId is required when rewardType is machine." });
            return;
        }
        const updatePayload = {};
        if (data.title !== undefined)
            updatePayload.title = data.title;
        if (data.partnerUrl !== undefined)
            updatePayload.partnerUrl = data.partnerUrl;
        if (data.rewardType !== undefined)
            updatePayload.rewardType = data.rewardType;
        if (data.rewardAmount !== undefined)
            updatePayload.rewardAmount = new Prisma.Decimal(String(data.rewardAmount));
        if (data.rewardMinerId !== undefined)
            updatePayload.rewardMinerId = data.rewardMinerId;
        if (data.hashrateValidityDays !== undefined)
            updatePayload.hashrateValidityDays = data.hashrateValidityDays;
        if (data.startsAt !== undefined)
            updatePayload.startsAt = data.startsAt;
        if (data.expiresAt !== undefined)
            updatePayload.expiresAt = data.expiresAt;
        if (data.maxRedemptions !== undefined)
            updatePayload.maxRedemptions = data.maxRedemptions;
        if (data.sortOrder !== undefined)
            updatePayload.sortOrder = data.sortOrder;
        if (data.isActive !== undefined)
            updatePayload.isActive = data.isActive;
        if (data.rewardCode)
            updatePayload.codeHash = await hashReadEarnCode(data.rewardCode);
        const row = await readEarnAdminRepo.updateCampaign(id, updatePayload);
        res.json({ ok: true, campaign: mapCampaign(row) });
    }
    catch (e) {
        if (e instanceof ZodError) {
            res.status(400).json({ ok: false, message: e.issues?.[0]?.message || "Validation failed." });
            return;
        }
        if (errCode(e) === "P2025") {
            res.status(404).json({ ok: false, message: "Campaign not found." });
            return;
        }
        if (isMissingReadEarnTablesError(e))
            return respondMissingTables(res);
        log.error("adminUpdateReadEarnCampaign failed", { error: String(e) });
        res.status(500).json({ ok: false, message: "Failed to update campaign." });
    }
}
export async function adminDeleteReadEarnCampaign(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id < 1) {
            res.status(400).json({ ok: false, message: "Invalid campaign id." });
            return;
        }
        const cnt = await readEarnAdminRepo.countRedemptionsForCampaign(id);
        if (cnt > 0) {
            res.status(409).json({ ok: false, message: "Cannot delete a campaign that already has redemptions." });
            return;
        }
        await readEarnAdminRepo.deleteCampaign(id);
        res.json({ ok: true });
    }
    catch (e) {
        if (errCode(e) === "P2025") {
            res.status(404).json({ ok: false, message: "Campaign not found." });
            return;
        }
        if (isMissingReadEarnTablesError(e))
            return respondMissingTables(res);
        log.error("adminDeleteReadEarnCampaign failed", { error: String(e) });
        res.status(500).json({ ok: false, message: "Failed to delete campaign." });
    }
}
export async function adminListReadEarnRedemptions(req, res) {
    try {
        const campaignId = Number(req.params.id);
        if (!Number.isInteger(campaignId) || campaignId < 1) {
            res.status(400).json({ ok: false, message: "Invalid campaign id." });
            return;
        }
        const take = Math.min(100, Math.max(1, Number(req.query.take) || 50));
        const skip = Math.max(0, Number(req.query.skip) || 0);
        const campaign = await readEarnAdminRepo.findCampaignTitleById(campaignId);
        if (!campaign) {
            res.status(404).json({ ok: false, message: "Campaign not found." });
            return;
        }
        const { rows, total } = await readEarnAdminRepo.listRedemptionsForCampaign(campaignId, skip, take);
        res.json({
            ok: true,
            campaign,
            total,
            redemptions: rows.map((r) => ({ id: r.id, userId: r.userId, username: r.user?.username, email: r.user?.email, rewardSnapshot: r.rewardSnapshot, redeemedAt: r.redeemedAt, ip: r.ip })),
        });
    }
    catch (e) {
        if (isMissingReadEarnTablesError(e))
            return respondMissingTables(res);
        log.error("adminListReadEarnRedemptions failed", { error: String(e) });
        res.status(500).json({ ok: false, message: "Failed to list redemptions." });
    }
}
