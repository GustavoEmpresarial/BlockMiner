/**
 * Ported from legacy/server/modules/zerads/zerads.controller.ts — business logic split out
 * of the express handler so it's unit-testable without a live HTTP request (per module pattern
 * used across current/, e.g. faucet.service.ts / shop.service.ts).
 *
 * Security properties preserved exactly from legacy (do not weaken):
 *  - IP allowlist (`ZERADS_ALLOWED_IPS` / `ZERADS_SERVER_IP`, default 162.0.208.108).
 *  - Password compared with `crypto.timingSafeEqual` (constant-time), not `===`.
 *  - Idempotency: SHA-256 hash of `username|amount|clicks|<5-min bucket>`. This is a time-window
 *    heuristic, NOT an airtight replay guard (two callbacks landing in different 5-min buckets
 *    are indistinguishable from two genuine callbacks) — ported as-is from legacy, not upgraded
 *    or downgraded.
 *  - Daily click cap: `ZERADS_MAX_CLICKS_PER_UTC_DAY` (default 100), computed via
 *    shared/calendar/utcCalendar.ts (site-wide UTC 00:00 boundary), not legacy's local helpers.
 *  - Credit security (zerads.security.ts): per-callback click cap, rolling velocity window,
 *    and antibot risk gate (soft-deny → ack "1" without credit, same as daily-cap full).
 *
 * Deviations from legacy (documented, same pattern as offerwallme.service.ts / energy-tax.service.ts):
 *  - `applyUserBalanceDelta` (legacy's in-memory mining-engine balance sync from
 *    `src/runtime/miningRuntime.js`) is NOT called — no current/ equivalent exists yet. The DB
 *    write (inside the $transaction) is the source of truth; balance reads always hit the DB.
 *  - `createAuditLogBestEffort` (legacy's global audit-log model) is dropped — a global audit-log
 *    deposit is forbidden by ARQUITETURA.md's module doctrine in current/. Replaced with structured
 *    logger calls only.
 *  - Tournament hook: `recordTournamentAction(ZERADS)` on credited callback (Fase 7 wired).
 */
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { OFFERWALL_BLK_PER_CLICK, blkForOfferwallClicks } from "../../shared/offerwallBlkPayout.js";
import * as zeradsRepo from "./zerads.repository.js";
import { recordTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../tournaments/index.js";
import { ZERADS_MAX_CLICKS_PER_UTC_DAY, zeradsUtcDayBounds } from "./zerads.limits.js";
import { loadAndEvaluateZeradsAntibotGate, trimZeradsClicksForSecurity, zeradsVelocityWindowBounds, } from "./zerads.security.js";
const log = logger.child("zerads.service");
// Kept for callback hash / audit of provider ZER amount — payout to user is fixed BLK/click.
const _rawRate = process.env.ZERADS_PTC_EXCHANGE_RATE || process.env.ZERADS_EXCHANGE_RATE || "0.07";
export const EXCHANGE_RATE = Number(_rawRate) || 0.07;
export const MAX_ZER_PER_CALLBACK = Number(process.env.ZERADS_MAX_ZER_PER_CALLBACK ?? "5");
/** @deprecated POL split no longer used — fixed BLK/click. Kept for test/API compat. */
export const PAYOUT_MULTIPLIER = 1;
export const BLK_PER_CLICK = OFFERWALL_BLK_PER_CLICK;
const _allowedIpsRaw = (process.env.ZERADS_ALLOWED_IPS || process.env.ZERADS_SERVER_IP || "162.0.208.108").trim();
export const ZERADS_ALLOWED_IPS = new Set(_allowedIpsRaw.split(",").map((s) => s.trim()).filter(Boolean).length
    ? _allowedIpsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : ["162.0.208.108"]);
export const SITE_ID = "10776";
export const ZERADS_PTC_BASE = "https://zerads.com/ptc.php";
const HISTORY_PAGE_SIZE = 10;
/** Constant-time string comparison — never use `===` for secrets (timing side-channel). */
export function timingSafeEqualStrings(a, b) {
    const aBuf = Buffer.from(a, "utf8");
    const bBuf = Buffer.from(b, "utf8");
    if (aBuf.length !== bBuf.length)
        return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
}
export function isIpAllowed(ip) {
    return ZERADS_ALLOWED_IPS.has(ip);
}
/**
 * Idempotency key: hash covers username + amount + clicks + 5-min bucket so replays inside the
 * same window are rejected via the DB's unique constraint on `callback_hash`. Time-window
 * heuristic, not a true nonce — see module header.
 */
export function buildCallbackHash(username, amountZer, clicks, now = new Date()) {
    const bucket = Math.floor(now.getTime() / 300_000); // 5-min window
    const payload = `${username}|${amountZer}|${clicks}|${bucket}`;
    return crypto.createHash("sha256").update(payload).digest("hex");
}
function isUniqueCallbackHashViolation(err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        JSON.stringify(err.meta?.target ?? "").includes("callback_hash")) {
        return true;
    }
    // Prisma pg-adapter / array-$transaction sometimes surfaces the unique violation as a
    // plain Error whose message still names the column — match legacy's string fallback.
    const msg = err instanceof Error ? err.message : String(err);
    return msg.includes("Unique constraint") && msg.includes("callback_hash");
}
/**
 * Processes the /zeradsptc.php S2S callback end to end (auth already validated by caller —
 * IP allowlist happens before this, see controller). Returns a discriminated result the
 * controller maps to the exact plain-text "1"/"0" response the provider expects.
 */
export async function processZeradsCallback(params) {
    const { clientIp, pwd, username, rawAmount, rawClicks } = params;
    const secret = (process.env.ZERADS_CALLBACK_PASSWORD ?? process.env.ZERADS_CALLBACK_SECRET ?? "").trim();
    if (!secret) {
        log.error("zerads.callback.no_secret_configured");
        return { ok: false, status: 500, code: "NO_SECRET_CONFIGURED" };
    }
    if (!pwd || !timingSafeEqualStrings(pwd, secret)) {
        log.warn("zerads.callback.bad_password", { ip: clientIp });
        return { ok: false, status: 403, code: "BAD_PASSWORD" };
    }
    if (!username || username.trim() === "") {
        return { ok: false, status: 400, code: "MISSING_USERNAME" };
    }
    const amountZer = parseFloat(rawAmount ?? "");
    if (!Number.isFinite(amountZer) || amountZer <= 0) {
        log.warn("zerads.callback.invalid_amount", { rawAmount, username });
        return { ok: false, status: 400, code: "INVALID_AMOUNT" };
    }
    const cappedZer = Math.min(amountZer, MAX_ZER_PER_CALLBACK);
    if (cappedZer < amountZer) {
        log.warn("zerads.callback.amount_capped", { username, requested: amountZer, capped: cappedZer });
    }
    const clicks = parseInt(rawClicks ?? "0", 10) || 0;
    if (clicks <= 0) {
        log.warn("zerads.callback.no_clicks", { username, rawClicks });
        return { ok: false, status: 400, code: "NO_CLICKS" };
    }
    const user = await zeradsRepo.findUserByUsernameForCallback(username.trim());
    if (!user) {
        log.warn("zerads.callback.user_not_found", { username });
        return { ok: false, status: 404, code: "USER_NOT_FOUND" };
    }
    if (user.isBanned) {
        log.warn("zerads.callback.user_banned", { userId: user.id, username });
        return { ok: false, status: 403, code: "USER_BANNED" };
    }
    const antibot = await loadAndEvaluateZeradsAntibotGate(prisma, user.id);
    if (!antibot.allowed) {
        log.warn("zerads.callback.antibot_denied", {
            username,
            userId: user.id,
            reason: antibot.reason,
            band: antibot.band,
            riskScore: antibot.riskScore,
        });
        // Soft-deny: ack so provider does not retry; no BLK credit.
        return { ok: true };
    }
    const callbackHash = buildCallbackHash(username.trim(), cappedZer, clicks);
    const now = new Date();
    const { start: utcDayStartBound, end: utcDayEndBound } = zeradsUtcDayBounds(now);
    const { start: velocityStart, end: velocityEnd } = zeradsVelocityWindowBounds(now);
    const [dayAgg, velocityAgg] = await Promise.all([
        zeradsRepo.sumClicksInWindow(user.id, utcDayStartBound, utcDayEndBound),
        zeradsRepo.sumClicksInWindow(user.id, velocityStart, velocityEnd),
    ]);
    const clicksToday = Number(dayAgg._sum.clicks ?? 0);
    const clicksInVelocityWindow = Number(velocityAgg._sum.clicks ?? 0);
    const remaining = Math.max(0, ZERADS_MAX_CLICKS_PER_UTC_DAY - clicksToday);
    if (remaining <= 0) {
        log.warn("zerads.callback.daily_click_cap", { username, userId: user.id, clicksToday, max: ZERADS_MAX_CLICKS_PER_UTC_DAY });
        // Matches legacy: daily cap reached is acknowledged as success (provider shouldn't retry).
        return { ok: true };
    }
    const trimmed = trimZeradsClicksForSecurity({
        requestedClicks: clicks,
        dayRemaining: remaining,
        clicksInVelocityWindow,
    });
    const creditedClicks = trimmed.creditedClicks;
    if (creditedClicks <= 0) {
        log.warn("zerads.callback.security_cap", {
            username,
            userId: user.id,
            requested: clicks,
            trimReason: trimmed.trimReason,
            clicksToday,
            clicksInVelocityWindow,
        });
        return { ok: true };
    }
    const clickRatio = creditedClicks / clicks;
    const blkPerClick = blkForOfferwallClicks(1);
    const blkToCredit = blkForOfferwallClicks(creditedClicks);
    const creditedZer = cappedZer * clickRatio;
    if (creditedClicks < clicks) {
        log.warn("zerads.callback.clicks_trimmed", {
            username,
            userId: user.id,
            requested: clicks,
            credited: creditedClicks,
            clicksToday,
            clicksInVelocityWindow,
            trimReason: trimmed.trimReason,
        });
    }
    try {
        await zeradsRepo.createCallbackAndCreditBalance({
            userId: user.id,
            username: user.username,
            creditedZer,
            exchangeRate: BLK_PER_CLICK,
            blkToCredit,
            blkPerClick,
            creditedClicks,
            clientIp,
            callbackHash,
            now,
        });
    }
    catch (err) {
        if (isUniqueCallbackHashViolation(err)) {
            // Duplicate callback for this 5-min window — already credited, safe to ack.
            log.warn("zerads.callback.duplicate_ignored", { username, callbackHash });
            return { ok: true };
        }
        const msg = err instanceof Error ? err.message : String(err);
        log.error("zerads.callback.transaction_failed", { username, error: msg });
        return { ok: false, status: 500, code: "TRANSACTION_FAILED" };
    }
    log.info("zerads.callback.credited", {
        userId: user.id,
        username,
        amountZer: creditedZer,
        blkCredited: blkToCredit.toFixed(8),
        blkPerClick: blkPerClick.toFixed(8),
        clicks: creditedClicks,
        clicksRequested: clicks,
        mode: "per_click_rows",
    });
    void recordTournamentAction({
        userId: user.id,
        provider: TOURNAMENT_ACTION_PROVIDER.ZERADS,
        actionCount: creditedClicks,
        executedAtUTC: now,
        providerEventId: callbackHash,
        metadata: { username, creditedZer, clicksRequested: clicks, blkCredited: Number(blkToCredit) },
    }).catch((err) => log.warn("tournament.action.failed", { callbackHash, error: String(err) }));
    return { ok: true };
}
export async function getUserZeradsLink(userId) {
    const user = await zeradsRepo.findUsernameById(userId);
    if (!user?.username)
        return { ok: false, reason: "no_username" };
    const url = `${ZERADS_PTC_BASE}?ref=${SITE_ID}&user=${encodeURIComponent(user.username)}`;
    return {
        ok: true,
        url,
        username: user.username,
        exchangeRate: BLK_PER_CLICK,
        blkPerClick: BLK_PER_CLICK,
        siteId: SITE_ID,
    };
}
export async function getZeradsHistoryForUser(userId, page) {
    const safePage = Math.max(1, page || 1);
    const skip = (safePage - 1) * HISTORY_PAGE_SIZE;
    const { entries, total } = await zeradsRepo.listCallbackHistory(userId, skip, HISTORY_PAGE_SIZE);
    return {
        entries,
        total,
        page: safePage,
        pageSize: HISTORY_PAGE_SIZE,
        totalPages: Math.ceil(total / HISTORY_PAGE_SIZE),
    };
}
export async function getZeradsStatsForUser(userId) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay());
    const startOfMonth = new Date(Date.UTC(startOfDay.getUTCFullYear(), startOfDay.getUTCMonth(), 1));
    const { agg, todayAgg, weekAgg, monthAgg } = await zeradsRepo.getStatsAggregates(userId, startOfDay, startOfWeek, startOfMonth);
    return {
        totalZer: agg._sum.amountZer ?? 0,
        totalBlk: agg._sum.payoutAmount ?? 0,
        totalPol: agg._sum.payoutAmount ?? 0, // legacy alias — value is BLK
        totalClicks: agg._sum.clicks ?? 0,
        totalCallbacks: agg._count.id,
        clicksToday: todayAgg._sum.clicks ?? 0,
        clicksWeek: weekAgg._sum.clicks ?? 0,
        clicksMonth: monthAgg._sum.clicks ?? 0,
        blkPerClick: BLK_PER_CLICK,
    };
}
