/**
 * Offerwall.GG publisher integration.
 * Signature: HMAC-SHA256(userId:transactionId:currencyAmount, SECRET)
 * Response body "ok" (or any 2xx).
 * Embed: https://offerwall.gg/wall/{PUBLIC_KEY}?userId={USER_ID}
 */
import { logger } from "../../core/logger/index.js";
import { OFFERWALL_BLK_PER_CLICK, blkForOfferwallClicks } from "../../shared/offerwallBlkPayout.js";
import { recordTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../tournaments/index.js";
import * as offerwallGgRepo from "./offerwallgg.repository.js";
import {
  buildOfferwallGgEmbedUrl,
  isIpAllowed as checkIp,
  mapOfferwallGgStatus,
  parseAllowedIps,
  verifyOfferwallGgSignature,
} from "./offerwallgg.pure.js";
import type { OfferwallGgPostbackInput } from "./offerwallgg.types.js";

const log = logger.child("offerwallgg.service");

export const OFFERWALLGG_PUBLIC_KEY = (process.env.OFFERWALLGG_PUBLIC_KEY ?? "").trim();
const SECRET_KEY = (process.env.OFFERWALLGG_SECRET ?? "").trim();

export const BLK_PER_CLICK = OFFERWALL_BLK_PER_CLICK;
const MAX_PAYOUT_USD_PER_CALLBACK = Number(process.env.OFFERWALLGG_MAX_PAYOUT_USD ?? "50");
export const HISTORY_PAGE_SIZE = 10;

/** Empty = allow all IPs (docs rely on HMAC, no published allowlist). */
const ALLOWED_IPS = parseAllowedIps(process.env.OFFERWALLGG_ALLOWED_IPS ?? "");

export function isIpAllowed(ip: string): boolean {
  return checkIp(ALLOWED_IPS, ip);
}

export function verifySignature(
  userId: string,
  transactionId: string,
  amount: string,
  signature: string,
): boolean {
  return verifyOfferwallGgSignature(SECRET_KEY, userId, transactionId, amount, signature);
}

export type PostbackResult =
  | { kind: "ok" }
  | { kind: "forbidden"; message: string }
  | { kind: "bad_request"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "internal"; message: string };

export async function processPostback(input: OfferwallGgPostbackInput, clientIp: string): Promise<PostbackResult> {
  const { userId: userRaw, transactionId, amount, payoutUsd: payoutRaw, offerName, offerId, status, test, signature } =
    input;

  if (!userRaw || !transactionId || !amount || !signature) {
    log.warn("postback.missing_params", { userRaw, transactionId });
    return { kind: "bad_request", message: "ERROR: Missing parameters" };
  }

  if (!verifySignature(userRaw, transactionId, amount, signature)) {
    log.warn("postback.bad_signature", { userRaw, transactionId, ip: clientIp });
    return { kind: "forbidden", message: "ERROR: Signature doesn't match" };
  }

  const userId = parseInt(userRaw, 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    log.warn("postback.invalid_user_id", { userRaw });
    return { kind: "bad_request", message: "ERROR: Invalid user" };
  }

  const rawPayoutUsd = Math.abs(parseFloat(payoutRaw) || 0);
  const payoutUsd = Math.min(rawPayoutUsd, MAX_PAYOUT_USD_PER_CALLBACK);
  if (payoutUsd < rawPayoutUsd) {
    log.warn("postback.payout_capped", { userId, transactionId, requested: rawPayoutUsd, capped: payoutUsd });
  }

  if (test === "1") {
    log.info("postback.test_ignored", { userRaw, transactionId, payoutUsd });
    return { kind: "ok" };
  }

  const ledgerStatus = mapOfferwallGgStatus(status, amount);

  const user = await offerwallGgRepo.findUserForPostback(userId);
  if (!user) {
    log.warn("postback.user_not_found", { userId });
    return { kind: "not_found", message: "ERROR: User not found" };
  }
  if (user.isBanned) {
    log.warn("postback.user_banned", { userId });
    return { kind: "ok" };
  }

  const blkToCredit = blkForOfferwallClicks(1);
  const blkAmount = Number(blkToCredit);
  let creditedAt = new Date();
  const offerType = offerId || null;

  try {
    if (ledgerStatus === 2) {
      await offerwallGgRepo.createChargebackCallback({
        userId,
        transId: transactionId,
        offerName: offerName || null,
        offerType,
        payoutUsd,
        polPrice: 1,
        status: ledgerStatus,
        clientIp,
        polDebited: -blkAmount,
        polDebit: blkToCredit,
      });
    } else {
      const row = await offerwallGgRepo.createCreditCallback({
        userId,
        transId: transactionId,
        offerName: offerName || null,
        offerType,
        payoutUsd,
        polPrice: 1,
        status: ledgerStatus,
        clientIp,
        polDecimal: blkToCredit,
      });
      creditedAt = row.createdAt;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint") && msg.includes("trans_id")) {
      log.warn("postback.duplicate_ignored", { transactionId, userId });
      return { kind: "ok" };
    }
    log.error("postback.transaction_failed", { transactionId, userId, error: msg });
    return { kind: "internal", message: "ERROR: Internal" };
  }

  log.info("postback.credited", {
    userId,
    transactionId,
    payoutUsd,
    blkCredited: blkToCredit.toFixed(8),
    status: ledgerStatus,
  });

  if (ledgerStatus === 1) {
    void recordTournamentAction({
      userId,
      provider: TOURNAMENT_ACTION_PROVIDER.OFFERWALLGG,
      actionCount: 1,
      executedAtUTC: creditedAt,
      providerEventId: transactionId,
      metadata: { offerName, offerId, blkCredited: blkAmount },
    }).catch((err) => log.warn("tournament.action.failed", { transactionId, error: String(err) }));
  }

  return { kind: "ok" };
}

export async function getHistoryForUser(userId: number, page: number) {
  const safePage = Math.max(1, page || 1);
  const skip = (safePage - 1) * HISTORY_PAGE_SIZE;
  const { entries, total } = await offerwallGgRepo.listCallbackHistory(userId, skip, HISTORY_PAGE_SIZE);
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
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay());
  const startOfMonth = new Date(Date.UTC(startOfDay.getUTCFullYear(), startOfDay.getUTCMonth(), 1));

  const { agg, offersToday, offersWeek, offersMonth } = await offerwallGgRepo.getStatsAggregates(
    userId,
    startOfDay,
    startOfWeek,
    startOfMonth,
  );

  return {
    totalUsd: agg._sum.payoutUsd ?? 0,
    totalBlk: agg._sum.polCredited ?? 0,
    totalPol: agg._sum.polCredited ?? 0,
    totalOffers: agg._count.id,
    offersToday,
    offersWeek,
    offersMonth,
    blkPerClick: BLK_PER_CLICK,
  };
}

export function buildEmbedUrl(userId: number): string | null {
  return buildOfferwallGgEmbedUrl({
    publicKey: OFFERWALLGG_PUBLIC_KEY,
    userId,
    baseUrl: process.env.OFFERWALLGG_WALL_BASE_URL,
  });
}
