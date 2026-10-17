/**
 * Ported from legacy/server/modules/offerwallme/offerwallme.controller.ts.
 *
 * Cross-module / deviation notes:
 * - POL balance mutation happens via direct `tx.user.update({ data: { polBalance: ... } })`
 *   inside offerwallme.repository.ts's own `prisma.$transaction`, matching the established
 *   convention confirmed against current/server/modules/shop/shop.service.ts (there is no
 *   separate `creditWallet()` export on wallet/index.ts).
 * - POL/USD price: reuses wallet/'s public `getPolUsdPrice()` (same as moneyrain/).
 * - Real-time in-memory mining-engine balance sync (legacy's `applyUserBalanceDelta` from
 *   `src/runtime/miningRuntime.js`) has no current/ equivalent yet — dropped; the DB write
 *   is the source of truth and balance reads always hit the DB in current/.
 * - Audit logging (legacy's `createAuditLogBestEffort` from a global `models/auditLogModel.js`)
 *   was a global deposit forbidden by ARQUITETURA.md's module doctrine. Replaced with
 *   structured logger calls only — no global audit-log module exists in current/ yet.
 * - Tournament hook: `recordTournamentAction(OFFERWALLME)` on status===1 (Fase 7 wired).
 */
import crypto from "node:crypto";
import { logger } from "../../core/logger/index.js";
import { OFFERWALL_BLK_PER_CLICK, blkForOfferwallClicks } from "../../shared/offerwallBlkPayout.js";
import {
  OFFERWALL_CALLBACK_STATUS,
  isPrismaUniqueViolation,
  type OfferwallReversalOutcome,
} from "../../shared/offerwallCallbackStatus.js";
import { parseOfferwallSubId, signOfferwallSubId } from "../../shared/security/offerwallSubId.js";
import { recordTournamentAction, reverseTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../tournaments/index.js";
import { utcWeekStart } from "../tournaments/tournament-window.js";
import * as offerwallmeRepo from "./offerwallme.repository.js";
import type { OfferwallMePostbackInput } from "./offerwallme.types.js";

const log = logger.child("offerwallme.service");

export const OFFERWALLME_API_KEY = (process.env.OFFERWALLME_API_KEY ?? "").trim();
const SECRET_KEY = (process.env.OFFERWALLME_SECRET ?? "").trim();

export function isOfferwallMeMaintenance(): boolean {
  const value = process.env.OFFERWALLME_MAINTENANCE;
  if (value === undefined || value === null || value === "") return false;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

if (isOfferwallMeMaintenance()) {
  log.warn("offerwallme.maintenance_active", {
    code: "OFFERWALLME_MAINTENANCE_ACTIVE",
    provider: "offerwallme",
    timestamp: new Date().toISOString(),
  });
}

export function offerwallMePublisherId(): string {
  return String(process.env.OFFERWALLME_PUBLISHER_ID || "yyu8i3jt58by9do1fbdr0fyn60yn5u").trim();
}

export function buildOfferwallMeUrl(userId: number): string {
  const publisherId = offerwallMePublisherId();
  return `https://offerwall.me/offerwall/${publisherId}/${signOfferwallSubId("offerwallme", userId)}`;
}

/** Fixed BLK per completed offer (= 1 click). */
export const BLK_PER_CLICK = OFFERWALL_BLK_PER_CLICK;
const MAX_PAYOUT_USD_PER_CALLBACK = Number(process.env.OFFERWALLME_MAX_PAYOUT_USD ?? "50");
export const HISTORY_PAGE_SIZE = 10;

const _allowedIpsRaw = (process.env.OFFERWALLME_ALLOWED_IPS ?? "95.216.65.163,2a01:4f9:2b:1dc::2").trim();
const ALLOWED_IPS = new Set(
  _allowedIpsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

export function isIpAllowed(ip: string): boolean {
  return ALLOWED_IPS.has(ip);
}

export function verifySignature(subId: string, transId: string, reward: string, signature: string): boolean {
  const expected = crypto.createHash("md5").update(subId + transId + reward + SECRET_KEY).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  let signatureBuf: Buffer;
  try {
    signatureBuf = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

export type PostbackResult =
  | { kind: "ok" }
  | { kind: "forbidden"; message: string }
  | { kind: "bad_request"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "internal"; message: string };

export async function processPostback(input: OfferwallMePostbackInput, clientIp: string): Promise<PostbackResult> {
  const { subId, transId, reward, payout, offerName, offerType, status, debug, signature } = input;

  if (!subId || !transId || !reward || !signature) {
    log.warn("postback.missing_params", { subId, transId });
    return { kind: "bad_request", message: "ERROR: Missing parameters" };
  }

  if (!verifySignature(subId, transId, reward, signature)) {
    log.warn("postback.bad_signature", { subId, transId, ip: clientIp });
    return { kind: "forbidden", message: "ERROR: Signature doesn't match" };
  }

  const parsed = parseOfferwallSubId("offerwallme", subId);
  if (!parsed.ok) {
    log.warn("postback.invalid_user_id", { subId, reason: parsed.reason });
    return { kind: "bad_request", message: "ERROR: Invalid user" };
  }
  const userId = parsed.userId;

  const rawPayoutUsd = parseFloat(payout) || 0;
  const payoutUsd = Math.min(rawPayoutUsd, MAX_PAYOUT_USD_PER_CALLBACK);
  if (payoutUsd < rawPayoutUsd) {
    log.warn("postback.payout_capped", { userId, transId, requested: rawPayoutUsd, capped: payoutUsd });
  }

  if (debug === "1") {
    log.info("postback.test_ignored", { subId, transId, payoutUsd });
    return { kind: "ok" };
  }

  const user = await offerwallmeRepo.findUserForPostback(userId);
  if (!user) {
    log.warn("postback.user_not_found", { userId });
    return { kind: "not_found", message: "ERROR: User not found" };
  }
  if (status === OFFERWALL_CALLBACK_STATUS.CHARGEBACK) {
    return processChargeback({ userId, transId, offerName, offerType, payoutUsd, clientIp });
  }
  if (user.isBanned) {
    log.warn("postback.user_banned", { userId });
    return { kind: "ok" }; // Acknowledge to avoid provider retries but don't credit.
  }

  // Fixed 0.0005 BLK per completed offer (1 click). Provider USD kept for audit only.
  const blkToCredit = blkForOfferwallClicks(1);
  const blkAmount = Number(blkToCredit);

  let creditedAt = new Date();
  try {
    const row = await offerwallmeRepo.createCreditCallback({
      userId,
      transId,
      offerName: offerName || null,
      offerType: offerType || null,
      payoutUsd,
      polPrice: 1, // 1 BLK ≈ $1 audit placeholder
      status,
      clientIp,
      polDecimal: blkToCredit,
    });
    creditedAt = row.createdAt;
  } catch (err: unknown) {
    if (isPrismaUniqueViolation(err)) {
      log.warn("postback.duplicate_ignored", { transId, userId });
      return { kind: "ok" };
    }
    const msg = err instanceof Error ? err.message : String(err);
    log.error("postback.transaction_failed", { transId, userId, error: msg });
    return { kind: "internal", message: "ERROR: Internal" };
  }

  log.info("postback.credited", { userId, transId, payoutUsd, blkCredited: blkToCredit.toFixed(8), status });

  if (status === OFFERWALL_CALLBACK_STATUS.CREDIT) {
    void recordTournamentAction({
      userId,
      provider: TOURNAMENT_ACTION_PROVIDER.OFFERWALLME,
      actionCount: 1,
      executedAtUTC: creditedAt,
      providerEventId: transId,
      metadata: { offerName, offerType, blkCredited: blkAmount },
    }).catch((err) => log.warn("tournament.action.failed", { transId, error: String(err) }));
  }

  return { kind: "ok" };
}

async function processChargeback(args: {
  userId: number;
  transId: string;
  offerName: string;
  offerType: string;
  payoutUsd: number;
  clientIp: string;
}): Promise<PostbackResult> {
  const { userId, transId } = args;
  let outcome: OfferwallReversalOutcome;
  try {
    outcome = await offerwallmeRepo.reverseCreditCallback({
      userId,
      transId,
      offerName: args.offerName || null,
      offerType: args.offerType || null,
      payoutUsd: args.payoutUsd,
      polPrice: 1,
      clientIp: args.clientIp,
    });
  } catch (err: unknown) {
    // A credit for the same trans_id raced in; the partner retries and the next attempt reverses it.
    const msg = err instanceof Error ? err.message : String(err);
    log.error("postback.chargeback_failed", { transId, userId, error: msg });
    return { kind: "internal", message: "ERROR: Internal" };
  }

  switch (outcome.kind) {
    case "user_mismatch":
      log.warn("postback.chargeback_user_mismatch", { transId, userId, ownerUserId: outcome.ownerUserId });
      return { kind: "bad_request", message: "ERROR: Transaction belongs to another user" };
    case "already_reversed":
      log.info("postback.chargeback_duplicate", { transId, userId });
      return { kind: "ok" };
    case "recorded_without_credit":
      log.warn("postback.chargeback_without_credit", { transId, userId });
      return { kind: "ok" };
    case "reversed":
      log.info("postback.chargeback_applied", { transId, userId, creditedAt: outcome.creditedAt.toISOString() });
      void reverseTournamentAction({
        provider: TOURNAMENT_ACTION_PROVIDER.OFFERWALLME,
        providerEventId: transId,
      }).catch((err) => log.warn("tournament.action.reverse_failed", { transId, error: String(err) }));
      return { kind: "ok" };
  }
}

export async function getHistoryForUser(userId: number, page: number) {
  const safePage = Math.max(1, page || 1);
  const skip = (safePage - 1) * HISTORY_PAGE_SIZE;
  const { entries, total } = await offerwallmeRepo.listCallbackHistory(userId, skip, HISTORY_PAGE_SIZE);
  return {
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
  const startOfWeek = utcWeekStart(startOfDay);
  const startOfMonth = new Date(Date.UTC(startOfDay.getUTCFullYear(), startOfDay.getUTCMonth(), 1));

  const { agg, offersToday, offersWeek, offersMonth } = await offerwallmeRepo.getStatsAggregates(
    userId,
    startOfDay,
    startOfWeek,
    startOfMonth,
  );

  return {
    totalUsd: agg._sum.payoutUsd ?? 0,
    totalBlk: agg._sum.polCredited ?? 0,
    totalPol: agg._sum.polCredited ?? 0, // legacy alias — value is BLK
    totalOffers: agg._count.id,
    offersToday,
    offersWeek,
    offersMonth,
    blkPerClick: BLK_PER_CLICK,
  };
}
