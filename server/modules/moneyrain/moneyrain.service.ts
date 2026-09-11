/**
 * Ported from legacy/server/modules/moneyrain/moneyrain.controller.ts.
 *
 * Cross-module / deviation notes (same shape as offerwallme.service.ts — read that
 * header first, this module follows the exact same precedent):
 * - POL balance mutation happens via direct `tx.user.update({ data: { polBalance: ... } })`
 *   inside moneyrain.repository.ts's own `prisma.$transaction`, matching shop/faucet/
 *   offerwallme convention — there is no separate `creditWallet()` export on wallet/index.ts.
 * - POL/USD price: reuses wallet/'s public `getPolUsdPrice()` (exported from
 *   wallet/index.ts in this change — it already existed as balance.service.ts's
 *   module-local cache backing the `GET /api/wallet/pol-usd` endpoint, just wasn't public
 *   yet). Falls back to `FALLBACK_POL_PRICE` on lookup failure, same as legacy.
 * - Real-time in-memory mining-engine balance sync (legacy's `applyUserBalanceDelta` from
 *   `src/runtime/miningRuntime.js`) has no current/ equivalent — dropped; the DB write is
 *   the source of truth and balance reads always hit the DB in current/.
 * - Audit logging (legacy's `createAuditLogBestEffort` from a global `models/auditLogModel.js`)
 *   was a global deposit forbidden by ARQUITETURA.md's module doctrine. Replaced with
 *   structured logger calls only.
 * - Tournament hook: `recordTournamentAction(MONEYRAIN)` on credited callback (Fase 7 wired).
 * - HMAC + timestamp-window mechanism preserved exactly: signature is computed over the
 *   *raw* request bytes (X-MoneyRain-Signature: sha256=...), not a re-serialization of
 *   req.body, because MoneyRain doesn't publish fixed source IPs — this is the only
 *   replay/tamper gate. Requires `req.rawBody`, now captured globally by
 *   core/http/setupHttpStack.ts's express.json() verify hook (added in this change).
 */
import crypto from "node:crypto";
import { logger } from "../../core/logger/index.js";
import { OFFERWALL_BLK_PER_CLICK, blkForOfferwallClicks } from "../../shared/offerwallBlkPayout.js";
import { recordTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../tournaments/index.js";
import * as moneyrainRepo from "./moneyrain.repository.js";
import type { MoneyRainCallbackPayload } from "./moneyrain.types.js";

const log = logger.child("moneyrain.service");

export const PUBLISHER_ID = (process.env.MONEYRAIN_PUBLISHER_ID ?? "").trim();
const DEFAULT_SECRET = (process.env.MONEYRAIN_CALLBACK_SECRET ?? "").trim();
const SITE_KEY = (process.env.MONEYRAIN_SITE_KEY ?? "").trim();

const MONEYRAIN_WALL_BASE = "https://offerwall.moneyrain.top/wall.php";

let SITE_SECRETS: Record<string, string> = {};
try {
  const raw = (process.env.MONEYRAIN_SITE_SECRETS_JSON ?? "").trim();
  if (raw) SITE_SECRETS = JSON.parse(raw);
} catch {
  log.error("moneyrain.site_secrets_json.invalid");
}

/** Fixed BLK per completed view/offer (= 1 click). */
export const BLK_PER_CLICK = OFFERWALL_BLK_PER_CLICK;
const MAX_PAYOUT_USD_PER_CALLBACK = Number(process.env.MONEYRAIN_MAX_PAYOUT_USD ?? "50");

// Reject callbacks whose timestamp has drifted too far — cheap replay mitigation.
const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000;

export const HISTORY_PAGE_SIZE = 10;

/** Kill-switch: blocks new MoneyRain sessions without a redeploy (toggle env + restart). */
export function isMoneyRainInMaintenance(): boolean {
  const v = String(process.env.MONEYRAIN_MAINTENANCE ?? "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function timingSafeEqualStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function resolveSecret(site: string): string {
  const mapped = site ? SITE_SECRETS[site] : undefined;
  return (mapped ?? DEFAULT_SECRET).trim();
}

export function verifySignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const provided = signatureHeader.slice(prefix.length).trim();
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqualStrings(provided, expected);
}

export function isTimestampFresh(timestampSec: number, nowMs: number = Date.now()): boolean {
  return Number.isFinite(timestampSec) && Math.abs(nowMs - timestampSec * 1000) <= MAX_TIMESTAMP_DRIFT_MS;
}

export type MoneyRainCallbackResult =
  | { ok: true; status: number; body: string }
  | { ok: false; status: number; body: string };

/**
 * Full callback pipeline: signature → timestamp freshness → payload shape → user lookup
 * → payout calc → idempotent credit. Returns a plain status/body pair so the controller
 * stays a thin HTTP adapter (mirrors offerwallme.service.ts's `creditPostback`).
 */
export async function processMoneyRainCallback(
  rawBody: Buffer | undefined,
  signatureHeader: string,
  timestampHeader: string,
  clientIp: string,
): Promise<MoneyRainCallbackResult> {
  if (!rawBody) {
    log.error("moneyrain.callback.no_raw_body");
    return { ok: false, status: 500, body: "no raw body" };
  }

  if (!DEFAULT_SECRET && Object.keys(SITE_SECRETS).length === 0) {
    log.error("moneyrain.callback.no_secret_configured");
    return { ok: false, status: 500, body: "no secret configured" };
  }

  let payload: MoneyRainCallbackPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { ok: false, status: 400, body: "bad json" };
  }

  const site = typeof payload.site === "string" ? payload.site : "";
  const secret = resolveSecret(site);
  if (!secret || !signatureHeader || !verifySignature(rawBody, signatureHeader, secret)) {
    log.warn("moneyrain.callback.bad_signature", { site });
    return { ok: false, status: 403, body: "bad signature" };
  }

  const timestampSec = Number(timestampHeader);
  if (!isTimestampFresh(timestampSec)) {
    log.warn("moneyrain.callback.stale_timestamp", { timestampHeader });
    return { ok: false, status: 400, body: "stale timestamp" };
  }

  if (payload.event !== "reward.completed" || payload.status !== "completed") {
    return { ok: false, status: 400, body: "bad payload" };
  }

  const externalUid = String(payload.external_uid ?? "").trim();
  const userId = parseInt(externalUid, 10);
  if (!externalUid || !Number.isFinite(userId) || userId <= 0) {
    log.warn("moneyrain.callback.invalid_external_uid", { externalUid });
    return { ok: false, status: 400, body: "invalid external_uid" };
  }

  const viewId = String(payload.view_id ?? "").trim();
  if (!viewId) {
    return { ok: false, status: 400, body: "missing view_id" };
  }

  const rawRewardUsdt = Number(payload.reward_usdt) || 0;
  const rewardUsdt = Math.min(rawRewardUsdt, MAX_PAYOUT_USD_PER_CALLBACK);
  if (rewardUsdt <= 0) {
    return { ok: false, status: 400, body: "bad reward" };
  }
  if (rewardUsdt < rawRewardUsdt) {
    log.warn("moneyrain.callback.payout_capped", { userId, viewId, requested: rawRewardUsdt, capped: rewardUsdt });
  }

  const user = await moneyrainRepo.findUserForCallback(userId);
  if (!user) {
    log.warn("moneyrain.callback.user_not_found", { userId });
    return { ok: false, status: 404, body: "user not found" };
  }
  if (user.isBanned) {
    log.warn("moneyrain.callback.user_banned", { userId });
    return { ok: true, status: 200, body: "ok" }; // Acknowledge to avoid retries but don't credit
  }

  const blkToCredit = blkForOfferwallClicks(1);
  const campaignId = Number.isFinite(Number(payload.campaign_id)) ? Number(payload.campaign_id) : null;
  const adType = typeof payload.ad_type === "string" ? payload.ad_type : null;
  const nonce = typeof payload.nonce === "string" ? payload.nonce : null;
  const now = new Date();

  try {
    await moneyrainRepo.createCallbackAndCreditBalance({
      userId: user.id,
      viewId,
      campaignId,
      adType,
      site: site || null,
      rewardUsdt,
      blkToCredit,
      polPrice: 1, // audit: 1 BLK ≈ $1
      nonce,
      clientIp,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint") && msg.includes("view_id")) {
      log.warn("moneyrain.callback.duplicate_ignored", { viewId, userId });
      return { ok: true, status: 200, body: "ok" };
    }
    log.error("moneyrain.callback.transaction_failed", { viewId, userId, error: msg });
    return { ok: false, status: 500, body: "internal error" };
  }

  log.info("moneyrain.callback.credited", {
    userId: user.id,
    viewId,
    rewardUsdt,
    blkCredited: blkToCredit.toFixed(8),
  });

  void recordTournamentAction({
    userId: user.id,
    provider: TOURNAMENT_ACTION_PROVIDER.MONEYRAIN,
    actionCount: 1,
    executedAtUTC: now,
    providerEventId: viewId,
    metadata: { campaignId, adType, site, blkCredited: Number(blkToCredit), timestampSource: "db_created_at" },
  }).catch((err) => log.warn("tournament.action.failed", { viewId, error: String(err) }));

  return { ok: true, status: 200, body: "ok" };
}

export function getMoneyRainLinkForUser(userId: number): { ok: true; url: string } | { ok: false; status: number; reason: string } {
  if (isMoneyRainInMaintenance()) {
    return { ok: false, status: 503, reason: "maintenance" };
  }
  if (!PUBLISHER_ID) {
    log.error("moneyrain.link.no_publisher_id_configured");
    return { ok: false, status: 500, reason: "not_configured" };
  }
  const params = new URLSearchParams({ pub: PUBLISHER_ID, uid: String(userId) });
  if (SITE_KEY) params.set("site", SITE_KEY);
  return { ok: true, url: `${MONEYRAIN_WALL_BASE}?${params.toString()}` };
}

export async function getHistoryForUser(userId: number, page: number) {
  const safePage = Math.max(1, page || 1);
  const skip = (safePage - 1) * HISTORY_PAGE_SIZE;
  const { entries, total } = await moneyrainRepo.listCallbackHistory(userId, skip, HISTORY_PAGE_SIZE);
  return {
    ok: true as const,
    entries,
    total,
    page: safePage,
    pageSize: HISTORY_PAGE_SIZE,
    totalPages: Math.ceil(total / HISTORY_PAGE_SIZE),
  };
}

export async function getStatsForUser(userId: number) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay());
  const startOfMonth = new Date(Date.UTC(startOfDay.getUTCFullYear(), startOfDay.getUTCMonth(), 1));

  const { agg, offersToday, offersWeek, offersMonth } = await moneyrainRepo.getStatsAggregates(
    userId,
    startOfDay,
    startOfWeek,
    startOfMonth,
  );

  return {
    ok: true as const,
    totalOffers: agg._count.id,
    totalUsd: Number(agg._sum.rewardUsdt || 0),
    totalBlk: Number(agg._sum.polCredited || 0),
    totalPol: Number(agg._sum.polCredited || 0), // legacy alias — value is BLK
    offersToday,
    offersWeek,
    offersMonth,
    blkPerClick: BLK_PER_CLICK,
  };
}
