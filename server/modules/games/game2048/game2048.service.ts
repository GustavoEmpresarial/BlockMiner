// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/services/game2048Service.ts.
 *
 * Deviation (documented, matches the pattern already used by inventory/machines):
 * legacy also calls `syncUserBaseHashRate()` + `getMiningEngine().findMinerByUserId()`
 * (mining hashrate resync) and `notifyMiniPassGamePlayed`/`notifyDailyTaskGamePlayed`
 * (mini-pass/daily-tasks hooks) after a successful claim. As of Fase 10d,
 * `notifyDailyTaskGamePlayed` IS wired for real (tasks/ module ported — see
 * current/docs/PROGRESSO.txt entry 10d). mini-pass still doesn't exist in current/. The
 * mining-hashrate resync hook is FIXED (item 75/88) — see the real call site below.
 *
 * Cross-module note: uses `shared/calendar/utcCalendar.ts` for the "checked in
 * today" day-key computation instead of importing from checkin/ (calendar math is
 * genuinely shared — see that file's header). Site-wide UTC 00:00 day boundary,
 * explicit product decision, replacing legacy's America/Sao_Paulo-anchored check.
 * The `dailyCheckin` table read itself is a direct Prisma query here.
 */
import { Prisma } from "@prisma/client";
import prisma from "../../../core/database/prisma.js";
import { logger } from "../../../core/logger/index.js";
import { getUtcDayKey, getUtcDayKeyLookupKeys } from "../../../shared/calendar/utcCalendar.js";
import { createInitialBoard, emptyBoard, hasValidMove, maxTile, moveBoard, parseBoard, } from "./game2048.engine.js";
import { GAME2048_GAME_SLUG, game2048CooldownMs, game2048MinScore, game2048PowerDays, game2048RewardHashRate, game2048TimeLimitSec, game2048WinTile, rewardDurationFromCheckinToday, } from "./game2048.constants.js";
import { notifyDailyTaskGamePlayed } from "../../tasks/index.js";
import { syncUserBaseHashRate } from "../../mining/index.js";
const SESSION_ACTIVE = "ACTIVE";
const SESSION_ENDED = "ENDED";
const SESSION_CLAIMED = "CLAIMED";
const STALE_ACTIVE_MS = 48 * 60 * 60 * 1000;
const log = logger.child("game2048.service");
export function computeCooldownEndsAt(claimedAt, now) {
    const cdMs = game2048CooldownMs();
    if (cdMs <= 0 || !claimedAt)
        return null;
    const end = new Date(claimedAt.getTime() + cdMs);
    return end > now ? end : null;
}
async function getOrCreateGame2048GameId(tx) {
    const g = await tx.game.upsert({
        where: { slug: GAME2048_GAME_SLUG },
        create: { name: "Chain 2048", slug: GAME2048_GAME_SLUG, isActive: true },
        update: {},
    });
    return g.id;
}
async function lockUserFor2048(tx, userId) {
    const uid = Math.floor(Number(userId));
    if (!Number.isInteger(uid) || uid < 1 || uid > 2_147_483_647) {
        throw new Error("lockUserFor2048: invalid userId");
    }
    await tx.$queryRaw(Prisma.sql `SELECT 1 FROM users WHERE id = ${uid} FOR UPDATE`);
}
async function userHasConfirmedCheckinToday(tx, userId, now) {
    const periodKey = getUtcDayKey(now);
    const row = await tx.dailyCheckin.findFirst({
        where: { userId, status: "confirmed", checkinDate: { in: getUtcDayKeyLookupKeys(periodKey) } },
        select: { id: true },
        orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    return Boolean(row);
}
async function expireStaleActiveSessions(tx, userId, now) {
    const threshold = new Date(now.getTime() - STALE_ACTIVE_MS);
    await tx.game2048Session.updateMany({
        where: { userId, status: SESSION_ACTIVE, updatedAt: { lt: threshold } },
        data: { status: SESSION_ENDED, endedAt: now },
    });
}
function boardFromRow(boardJson) {
    const parsed = parseBoard(boardJson);
    if (!parsed && boardJson != null) {
        log.warn("game2048_board_parse_failed");
    }
    return parsed;
}
function secondsRemainingForSession(row, now) {
    const limit = game2048TimeLimitSec();
    if (limit <= 0)
        return null;
    const startMs = new Date(row.createdAt).getTime();
    const elapsedSec = Math.floor((now.getTime() - startMs) / 1000);
    if (row.status !== SESSION_ACTIVE)
        return 0;
    return Math.max(0, limit - elapsedSec);
}
async function finalizeTimedOutSession(tx, row, now) {
    const limit = game2048TimeLimitSec();
    if (limit <= 0 || row.status !== SESSION_ACTIVE)
        return row;
    const startMs = new Date(row.createdAt).getTime();
    if (now.getTime() - startMs < limit * 1000)
        return row;
    return tx.game2048Session.update({ where: { id: row.id }, data: { status: SESSION_ENDED, endedAt: now } });
}
function serializeSession(row, now, rewardHint) {
    const board = boardFromRow(row.board);
    const winTile = game2048WinTile();
    const minScore = game2048MinScore();
    const hasMoves = board ? hasValidMove(board) : false;
    const scoreReached = (Number(row.score) || 0) >= minScore;
    const tileReached = board ? maxTile(board) >= winTile : false;
    const rewardEligible = scoreReached || tileReached;
    const canClaim = rewardEligible && !row.rewardGranted && row.status !== SESSION_CLAIMED && row.status !== SESSION_ACTIVE;
    const timeLimitSeconds = game2048TimeLimitSec();
    const secLeft = secondsRemainingForSession(row, now);
    const rd = rewardHint ?? rewardDurationFromCheckinToday(false);
    return {
        id: row.id,
        status: row.status,
        board: board || emptyBoard(),
        score: Number(row.score) || 0,
        won: Boolean(row.won) || scoreReached || tileReached,
        rewardGranted: Boolean(row.rewardGranted),
        hasMoves,
        canClaim,
        winTile,
        minScore,
        gameOver: row.status === SESSION_ENDED || row.status === SESSION_CLAIMED || !hasMoves,
        rewardHashRate: game2048RewardHashRate(),
        rewardPowerDays: rd.rewardPowerDays,
        rewardPowerHours: rd.rewardPowerHours,
        powerDaysFull: game2048PowerDays(),
        startedAt: new Date(row.createdAt).toISOString(),
        endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
        timeLimitSeconds,
        secondsRemaining: secLeft,
    };
}
export async function getGame2048Status(userId, now = new Date()) {
    // Read-only fast path (see legacy comment): this endpoint is polled constantly and must
    // never open an interactive transaction with a row lock unless there's actually a write.
    const [checkedInToday, lastClaimed, activeRowRead] = await Promise.all([
        userHasConfirmedCheckinToday(prisma, userId, now),
        prisma.game2048Session.findFirst({
            where: { userId, rewardGranted: true, rewardClaimedAt: { not: null } },
            orderBy: { rewardClaimedAt: "desc" },
        }),
        prisma.game2048Session.findFirst({ where: { userId, status: SESSION_ACTIVE }, orderBy: { id: "desc" } }),
    ]);
    const rewardDuration = rewardDurationFromCheckinToday(checkedInToday);
    const cooldownEndsAt = computeCooldownEndsAt(lastClaimed?.rewardClaimedAt ?? null, now);
    let active = activeRowRead;
    const staleThreshold = new Date(now.getTime() - STALE_ACTIVE_MS);
    const needsExpiry = active != null && new Date(active.updatedAt).getTime() < staleThreshold.getTime();
    const timeLimitSec = game2048TimeLimitSec();
    const needsFinalize = active != null && timeLimitSec > 0 && now.getTime() - new Date(active.createdAt).getTime() >= timeLimitSec * 1000;
    if (needsExpiry || needsFinalize) {
        active = await prisma.$transaction(async (tx) => {
            await lockUserFor2048(tx, userId);
            await expireStaleActiveSessions(tx, userId, now);
            const fresh = await tx.game2048Session.findFirst({ where: { userId, status: SESSION_ACTIVE }, orderBy: { id: "desc" } });
            return fresh ? await finalizeTimedOutSession(tx, fresh, now) : null;
        });
    }
    const winTile = game2048WinTile();
    const minScore = game2048MinScore();
    const cdMs = game2048CooldownMs();
    const cooldownMinutesHint = cdMs > 0 ? Math.max(1, Math.ceil(cdMs / 60_000)) : 0;
    return {
        ok: true,
        allowNewStart: !cooldownEndsAt && !active,
        cooldownEndsAt: cooldownEndsAt ? cooldownEndsAt.toISOString() : null,
        cooldownSecondsRemaining: cooldownEndsAt ? Math.max(0, Math.ceil((cooldownEndsAt.getTime() - now.getTime()) / 1000)) : 0,
        activeSession: active ? serializeSession(active, now, rewardDuration) : null,
        rewardHashRate: game2048RewardHashRate(),
        winTile,
        minScore,
        powerDays: game2048PowerDays(),
        rewardPowerDays: rewardDuration.rewardPowerDays,
        rewardPowerHours: rewardDuration.rewardPowerHours,
        powerDaysFull: game2048PowerDays(),
        cooldownMinutesHint,
    };
}
export async function startGame2048Session(userId, now = new Date()) {
    return prisma.$transaction(async (tx) => {
        await lockUserFor2048(tx, userId);
        await expireStaleActiveSessions(tx, userId, now);
        const checkedInToday = await userHasConfirmedCheckinToday(tx, userId, now);
        const rd = rewardDurationFromCheckinToday(checkedInToday);
        const lastClaimed = await tx.game2048Session.findFirst({
            where: { userId, rewardGranted: true, rewardClaimedAt: { not: null } },
            orderBy: { rewardClaimedAt: "desc" },
        });
        const cd = computeCooldownEndsAt(lastClaimed?.rewardClaimedAt ?? null, now);
        if (cd) {
            return {
                ok: false,
                code: "COOLDOWN_ACTIVE",
                status: 429,
                cooldownEndsAt: cd.toISOString(),
                cooldownSecondsRemaining: Math.max(0, Math.ceil((cd.getTime() - now.getTime()) / 1000)),
            };
        }
        let existing = await tx.game2048Session.findFirst({ where: { userId, status: SESSION_ACTIVE }, orderBy: { id: "desc" } });
        if (existing)
            existing = await finalizeTimedOutSession(tx, existing, now);
        if (existing && existing.status === SESSION_ACTIVE) {
            return { ok: true, reused: true, session: serializeSession(existing, now, rd) };
        }
        const board = createInitialBoard();
        const row = await tx.game2048Session.create({
            data: { userId, status: SESSION_ACTIVE, board, score: 0, won: false, rewardGranted: false },
        });
        return { ok: true, reused: false, session: serializeSession(row, now, rd) };
    });
}
/** Forfeits any active round and starts a fresh board (same rules as start; no reward). */
export async function restartGame2048Session(userId, now = new Date()) {
    return prisma.$transaction(async (tx) => {
        await lockUserFor2048(tx, userId);
        await expireStaleActiveSessions(tx, userId, now);
        const checkedInToday = await userHasConfirmedCheckinToday(tx, userId, now);
        const rd = rewardDurationFromCheckinToday(checkedInToday);
        const lastClaimed = await tx.game2048Session.findFirst({
            where: { userId, rewardGranted: true, rewardClaimedAt: { not: null } },
            orderBy: { rewardClaimedAt: "desc" },
        });
        const cd = computeCooldownEndsAt(lastClaimed?.rewardClaimedAt ?? null, now);
        if (cd) {
            return {
                ok: false,
                code: "COOLDOWN_ACTIVE",
                status: 429,
                cooldownEndsAt: cd.toISOString(),
                cooldownSecondsRemaining: Math.max(0, Math.ceil((cd.getTime() - now.getTime()) / 1000)),
            };
        }
        const active = await tx.game2048Session.findFirst({ where: { userId, status: SESSION_ACTIVE }, orderBy: { id: "desc" } });
        if (active) {
            await tx.game2048Session.update({ where: { id: active.id }, data: { status: SESSION_ENDED, endedAt: now } });
        }
        const board = createInitialBoard();
        const row = await tx.game2048Session.create({
            data: { userId, status: SESSION_ACTIVE, board, score: 0, won: false, rewardGranted: false },
        });
        return { ok: true, reused: false, session: serializeSession(row, now, rd) };
    });
}
export async function applyGame2048Move(userId, sessionId, direction, now = new Date()) {
    const sid = Math.floor(Number(sessionId));
    if (!sid)
        return { ok: false, code: "INVALID_SESSION", status: 400 };
    return prisma.$transaction(async (tx) => {
        await lockUserFor2048(tx, userId);
        await expireStaleActiveSessions(tx, userId, now);
        const checkedInToday = await userHasConfirmedCheckinToday(tx, userId, now);
        const rd = rewardDurationFromCheckinToday(checkedInToday);
        const initial = await tx.game2048Session.findFirst({ where: { id: sid, userId } });
        if (!initial)
            return { ok: false, code: "SESSION_NOT_FOUND", status: 404 };
        const row = await finalizeTimedOutSession(tx, initial, now);
        if (row.status !== SESSION_ACTIVE) {
            return { ok: false, code: "SESSION_NOT_ACTIVE", status: 409, session: serializeSession(row, now, rd) };
        }
        const board = boardFromRow(row.board);
        if (!board)
            return { ok: false, code: "INVALID_BOARD", status: 500 };
        const { board: afterMove, scoreDelta, moved } = moveBoard(board, direction);
        if (!moved) {
            return { ok: true, moved: false, session: serializeSession(row, now, rd) };
        }
        const nextBoard = afterMove;
        const { spawnRandomTile } = await import("./game2048.engine.js");
        spawnRandomTile(nextBoard);
        const nextScore = (Number(row.score) || 0) + scoreDelta;
        const winTile = game2048WinTile();
        const minScore = game2048MinScore();
        const won = Boolean(row.won) || maxTile(nextBoard) >= winTile || nextScore >= minScore;
        let nextStatus = SESSION_ACTIVE;
        let endedAt = row.endedAt;
        if (won) {
            nextStatus = SESSION_ENDED;
            endedAt = now;
        }
        else if (!hasValidMove(nextBoard)) {
            nextStatus = SESSION_ENDED;
            endedAt = now;
        }
        const updated = await tx.game2048Session.update({
            where: { id: row.id },
            data: { board: nextBoard, score: nextScore, won, status: nextStatus, endedAt },
        });
        return { ok: true, moved: true, session: serializeSession(updated, now, rd) };
    });
}
export async function claimGame2048Reward(userId, sessionId, meta = {}, now = new Date()) {
    const sid = Math.floor(Number(sessionId));
    if (!sid)
        return { ok: false, code: "INVALID_SESSION", status: 400 };
    const minScore = game2048MinScore();
    const winTile = game2048WinTile();
    const rewardHr = game2048RewardHashRate();
    const powerDaysFull = game2048PowerDays();
    const result = await prisma.$transaction(async (tx) => {
        await lockUserFor2048(tx, userId);
        await expireStaleActiveSessions(tx, userId, now);
        const checkedInToday = await userHasConfirmedCheckinToday(tx, userId, now);
        const rd = rewardDurationFromCheckinToday(checkedInToday);
        const row = await tx.game2048Session.findFirst({ where: { id: sid, userId } });
        if (!row)
            return { ok: false, code: "SESSION_NOT_FOUND", status: 404 };
        if (row.rewardGranted) {
            const lastClaimed = await tx.game2048Session.findFirst({
                where: { userId, rewardGranted: true, rewardClaimedAt: { not: null } },
                orderBy: { rewardClaimedAt: "desc" },
            });
            const cd = computeCooldownEndsAt(lastClaimed?.rewardClaimedAt ?? null, now);
            return {
                ok: true,
                idempotent: true,
                rewardHashRate: rewardHr,
                powerDays: powerDaysFull,
                rewardPowerDays: rd.rewardPowerDays,
                rewardPowerHours: rd.rewardPowerHours,
                nextClaimAllowedAt: cd ? cd.toISOString() : null,
                cooldownSecondsRemaining: cd ? Math.max(0, Math.ceil((cd.getTime() - now.getTime()) / 1000)) : 0,
            };
        }
        const board = boardFromRow(row.board);
        const maxT = board ? maxTile(board) : 0;
        const scoreOk = (Number(row.score) || 0) >= minScore;
        const tileOk = maxT >= winTile;
        if (!scoreOk && !tileOk)
            return { ok: false, code: "SCORE_TOO_LOW", status: 400 };
        if (row.status === SESSION_ACTIVE)
            return { ok: false, code: "SESSION_NOT_FINISHED", status: 400 };
        const lastClaimed = await tx.game2048Session.findFirst({
            where: { userId, rewardGranted: true, rewardClaimedAt: { not: null }, id: { not: row.id } },
            orderBy: { rewardClaimedAt: "desc" },
        });
        const cdOther = computeCooldownEndsAt(lastClaimed?.rewardClaimedAt ?? null, now);
        if (cdOther) {
            return {
                ok: false,
                code: "COOLDOWN_ACTIVE",
                status: 429,
                cooldownEndsAt: cdOther.toISOString(),
                cooldownSecondsRemaining: Math.max(0, Math.ceil((cdOther.getTime() - now.getTime()) / 1000)),
            };
        }
        const gameId = await getOrCreateGame2048GameId(tx);
        const playedAt = now;
        const expiresAt = new Date(playedAt.getTime() + rd.rewardTtlMs);
        const powerRow = await tx.userPowerGame.create({
            data: { userId, gameId, hashRate: rewardHr, playedAt, expiresAt },
        });
        await tx.game2048Session.update({
            where: { id: row.id },
            data: { status: SESSION_CLAIMED, rewardGranted: true, rewardClaimedAt: playedAt, endedAt: row.endedAt ?? playedAt },
        });
        await tx.auditLog.create({
            data: {
                userId,
                action: "GAME2048_CLAIM",
                ip: meta.ip ? String(meta.ip).slice(0, 64) : null,
                userAgent: meta.userAgent ? String(meta.userAgent).slice(0, 512) : null,
                detailsJson: JSON.stringify({ sessionId: row.id, winTile, score: row.score, hashRate: rewardHr, expiresAt: expiresAt.toISOString() }),
            },
        });
        const cd = game2048CooldownMs() > 0 ? new Date(playedAt.getTime() + game2048CooldownMs()) : null;
        return {
            ok: true,
            idempotent: false,
            rewardHashRate: rewardHr,
            powerDays: powerDaysFull,
            rewardPowerDays: rd.rewardPowerDays,
            rewardPowerHours: rd.rewardPowerHours,
            userPowerGameId: powerRow.id,
            nextClaimAllowedAt: cd ? cd.toISOString() : null,
            cooldownSecondsRemaining: cd ? Math.max(0, Math.ceil((cd.getTime() - now.getTime()) / 1000)) : 0,
        };
    });
    if (result.ok && !result.idempotent && "userPowerGameId" in result && result.userPowerGameId) {
        await syncUserBaseHashRate(userId).catch((err) => log.warn("game2048.hashrate_sync_failed", { userId, error: String(err) }));
        await notifyDailyTaskGamePlayed(userId, {
            userPowerGameId: result.userPowerGameId,
            gameSlug: GAME2048_GAME_SLUG,
        }).catch((err) => log.warn("game2048.daily_task_hook_failed", { userId, error: String(err) }));
        log.info("game2048_reward_claimed", { userId, userPowerGameId: result.userPowerGameId });
    }
    return result;
}
