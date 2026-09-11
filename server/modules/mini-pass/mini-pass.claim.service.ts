// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { REWARD_POL } from "./mini-pass.constants.js";
import { computePassLevel } from "./mini-pass.level-math.js";
import { applyPolDeltaInEngine, fulfillMiniPassLevelReward, syncMiningAfterMiniPassReward, } from "./mini-pass.reward.service.js";
import { isMiniPassSeasonLive } from "./mini-pass.season-live.js";
const log = logger.child("mini-pass.claim");
export async function claimMiniPassLevelReward(userId, seasonId, levelRewardId) {
    try {
        const out = await prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({ where: { id: userId } });
            if (!user || user.isBanned) {
                throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
            }
            const season = await tx.miniPassSeason.findFirst({
                where: { id: seasonId, deletedAt: null, isActive: true },
            });
            if (!season) {
                throw Object.assign(new Error("SEASON_NOT_FOUND"), { code: "NOT_FOUND" });
            }
            if (!isMiniPassSeasonLive(season, new Date())) {
                throw Object.assign(new Error("SEASON_NOT_LIVE"), { code: "NOT_LIVE" });
            }
            const reward = await tx.miniPassLevelReward.findFirst({
                where: { id: levelRewardId, seasonId },
            });
            if (!reward) {
                throw Object.assign(new Error("REWARD_NOT_FOUND"), { code: "NOT_FOUND" });
            }
            await tx.userMiniPassEnrollment.upsert({
                where: { userId_seasonId: { userId, seasonId } },
                create: { userId, seasonId, totalXp: 0 },
                update: {},
            });
            const enr = await tx.userMiniPassEnrollment.findUnique({
                where: { userId_seasonId: { userId, seasonId } },
            });
            const totalXp = Math.max(0, Math.floor(enr?.totalXp ?? 0));
            const xpPerLevel = Math.max(1, Math.floor(Number(season.xpPerLevel) || 1));
            const maxLevel = Math.max(1, Math.floor(Number(season.maxLevel) || 1));
            const userLevel = computePassLevel(totalXp, xpPerLevel, maxLevel);
            if (userLevel < reward.level) {
                throw Object.assign(new Error("NOT_ELIGIBLE"), { code: "NOT_ELIGIBLE" });
            }
            try {
                await tx.userMiniPassRewardClaim.create({
                    data: { userId, levelRewardId: reward.id },
                });
            }
            catch (e) {
                if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
                    return { duplicate: true, rewardKind: String(reward.rewardKind), summary: undefined };
                }
                throw e;
            }
            const summary = await fulfillMiniPassLevelReward(tx, { userId, reward });
            await tx.auditLog.create({
                data: {
                    userId,
                    action: "MINI_PASS_CLAIM",
                    detailsJson: JSON.stringify({
                        seasonId,
                        levelRewardId: reward.id,
                        level: reward.level,
                        rewardKind: reward.rewardKind,
                    }),
                },
            });
            return { duplicate: false, summary };
        });
        if (!out.duplicate && out.summary?.kind === REWARD_POL && "amount" in out.summary && out.summary.amount) {
            applyPolDeltaInEngine(userId, Number(out.summary.amount));
        }
        if (!out.duplicate) {
            await syncMiningAfterMiniPassReward(userId);
        }
        return { ok: true, duplicate: Boolean(out.duplicate), summary: out.summary };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "NOT_ELIGIBLE")
            return { ok: false, code: "not_eligible", status: 400 };
        if (msg === "SEASON_NOT_FOUND" || msg === "REWARD_NOT_FOUND") {
            return { ok: false, code: "not_found", status: 404 };
        }
        if (msg === "SEASON_NOT_LIVE")
            return { ok: false, code: "season_not_live", status: 400 };
        if (msg === "FORBIDDEN")
            return { ok: false, code: "forbidden", status: 403 };
        log.error("claimMiniPassLevelReward", { error: String(e) });
        return { ok: false, code: "error", status: 500 };
    }
}
