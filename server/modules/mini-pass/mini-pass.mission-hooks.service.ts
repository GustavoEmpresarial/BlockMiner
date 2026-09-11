// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Mission progress hooks — exported for later wiring from checkin/games/mining/etc.
 */
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { MISSION_AUTO_MINING_TURBO, MISSION_INTERNAL_OFFERWALL, MISSION_LOGIN_DAY, MISSION_MINE_BLK, MISSION_PLAY_GAMES, MISSION_WATCH_YOUTUBE, XP_SOURCE_MISSION, } from "./mini-pass.constants.js";
import { resolveMissionPeriodKey } from "./mini-pass.period.js";
import { isMiniPassSeasonLive } from "./mini-pass.season-live.js";
import { applyMiniPassXp } from "./mini-pass.xp.service.js";
async function loadLiveSeasonsWithMissions(missionType) {
    const now = new Date();
    return prisma.miniPassSeason.findMany({
        where: {
            deletedAt: null,
            isActive: true,
            startsAt: { lte: now },
            endsAt: { gte: now },
        },
        include: {
            missions: {
                where: { isActive: true, missionType },
                orderBy: { sortOrder: "asc" },
            },
        },
    });
}
async function tryConsumeDedupe(tx, missionId, dedupeKey) {
    try {
        await tx.userMiniPassMissionDedupeTick.create({
            data: { missionId, dedupeKey },
        });
        return true;
    }
    catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
            return false;
        throw e;
    }
}
async function bumpMissionProgress(tx, { userId, season, mission, delta, periodKey, }) {
    const target = Number(new Prisma.Decimal(String(mission.targetValue)));
    if (!Number.isFinite(target) || target <= 0)
        return;
    const d = new Prisma.Decimal(String(delta));
    await tx.userMiniPassMissionProgress.upsert({
        where: {
            userId_missionId_periodKey: {
                userId,
                missionId: mission.id,
                periodKey,
            },
        },
        create: {
            userId,
            missionId: mission.id,
            periodKey,
            currentValue: d,
        },
        update: {
            currentValue: { increment: d },
        },
    });
    const row = await tx.userMiniPassMissionProgress.findUnique({
        where: {
            userId_missionId_periodKey: {
                userId,
                missionId: mission.id,
                periodKey,
            },
        },
    });
    if (!row || row.completedAt)
        return;
    const cur = Number(new Prisma.Decimal(row.currentValue.toString()));
    if (cur < target)
        return;
    const locked = await tx.userMiniPassMissionProgress.updateMany({
        where: { id: row.id, completedAt: null },
        data: { completedAt: new Date() },
    });
    if (locked.count !== 1)
        return;
    const xpReward = Math.max(0, Math.floor(Number(mission.xpReward) || 0));
    if (xpReward <= 0)
        return;
    await applyMiniPassXp({
        userId,
        seasonId: season.id,
        amount: xpReward,
        source: XP_SOURCE_MISSION,
        idempotencyKey: `mini-pass-mission-${mission.id}-${periodKey}`,
        missionId: mission.id,
        periodKey,
        metadataJson: { missionType: mission.missionType },
        tx,
    });
}
export async function notifyMiniPassGamePlayed(userId, { userPowerGameId, gameSlug }) {
    if (!userId || !userPowerGameId)
        return;
    const seasons = await loadLiveSeasonsWithMissions(MISSION_PLAY_GAMES);
    for (const season of seasons) {
        if (!isMiniPassSeasonLive(season))
            continue;
        for (const mission of season.missions) {
            if (mission.gameSlug && mission.gameSlug !== gameSlug)
                continue;
            const periodKey = resolveMissionPeriodKey(mission.cadence, mission.missionType, new Date());
            const dedupeKey = `game-${userPowerGameId}`;
            await prisma.$transaction(async (tx) => {
                const ok = await tryConsumeDedupe(tx, mission.id, dedupeKey);
                if (!ok)
                    return;
                await bumpMissionProgress(tx, { userId, season, mission, delta: 1, periodKey });
            });
        }
    }
}
export async function notifyMiniPassBlkReward(userId, blkRewardLogId, amountBlk) {
    if (!userId || !blkRewardLogId)
        return;
    const amt = Number(amountBlk);
    if (!Number.isFinite(amt) || amt <= 0)
        return;
    const seasons = await loadLiveSeasonsWithMissions(MISSION_MINE_BLK);
    for (const season of seasons) {
        if (!isMiniPassSeasonLive(season))
            continue;
        for (const mission of season.missions) {
            const periodKey = resolveMissionPeriodKey(mission.cadence, mission.missionType, new Date());
            const dedupeKey = `blklog-${blkRewardLogId}`;
            await prisma.$transaction(async (tx) => {
                const ok = await tryConsumeDedupe(tx, mission.id, dedupeKey);
                if (!ok)
                    return;
                await bumpMissionProgress(tx, { userId, season, mission, delta: amt, periodKey });
            });
        }
    }
}
export async function notifyMiniPassLoginDay(userId, checkinDateKey) {
    if (!userId || !checkinDateKey)
        return;
    const seasons = await loadLiveSeasonsWithMissions(MISSION_LOGIN_DAY);
    const now = new Date();
    for (const season of seasons) {
        if (!isMiniPassSeasonLive(season))
            continue;
        for (const mission of season.missions) {
            const periodKey = resolveMissionPeriodKey(mission.cadence, mission.missionType, now);
            const dedupeKey = `login-${checkinDateKey}`;
            await prisma.$transaction(async (tx) => {
                const ok = await tryConsumeDedupe(tx, mission.id, dedupeKey);
                if (!ok)
                    return;
                await bumpMissionProgress(tx, { userId, season, mission, delta: 1, periodKey });
            });
        }
    }
}
export async function notifyMiniPassYoutubeWatch(userId, youtubeWatchHistoryId) {
    if (!userId || !youtubeWatchHistoryId)
        return;
    const seasons = await loadLiveSeasonsWithMissions(MISSION_WATCH_YOUTUBE);
    const now = new Date();
    for (const season of seasons) {
        if (!isMiniPassSeasonLive(season))
            continue;
        for (const mission of season.missions) {
            const periodKey = resolveMissionPeriodKey(mission.cadence, mission.missionType, now);
            const dedupeKey = `yt-${youtubeWatchHistoryId}`;
            await prisma.$transaction(async (tx) => {
                const ok = await tryConsumeDedupe(tx, mission.id, dedupeKey);
                if (!ok)
                    return;
                await bumpMissionProgress(tx, { userId, season, mission, delta: 1, periodKey });
            });
        }
    }
}
export async function notifyMiniPassAutoMiningTurbo(userId, turboGrantId) {
    if (!userId || !turboGrantId)
        return;
    const seasons = await loadLiveSeasonsWithMissions(MISSION_AUTO_MINING_TURBO);
    const now = new Date();
    for (const season of seasons) {
        if (!isMiniPassSeasonLive(season))
            continue;
        for (const mission of season.missions) {
            const periodKey = resolveMissionPeriodKey(mission.cadence, mission.missionType, now);
            const dedupeKey = `turbo-${turboGrantId}`;
            await prisma.$transaction(async (tx) => {
                const ok = await tryConsumeDedupe(tx, mission.id, dedupeKey);
                if (!ok)
                    return;
                await bumpMissionProgress(tx, { userId, season, mission, delta: 1, periodKey });
            });
        }
    }
}
export async function notifyMiniPassInternalOfferwall(userId, attemptId) {
    if (!userId || !attemptId)
        return;
    const seasons = await loadLiveSeasonsWithMissions(MISSION_INTERNAL_OFFERWALL);
    const now = new Date();
    for (const season of seasons) {
        if (!isMiniPassSeasonLive(season))
            continue;
        for (const mission of season.missions) {
            const periodKey = resolveMissionPeriodKey(mission.cadence, mission.missionType, now);
            const dedupeKey = `iof-${attemptId}`;
            await prisma.$transaction(async (tx) => {
                const ok = await tryConsumeDedupe(tx, mission.id, dedupeKey);
                if (!ok)
                    return;
                await bumpMissionProgress(tx, { userId, season, mission, delta: 1, periodKey });
            });
        }
    }
}
