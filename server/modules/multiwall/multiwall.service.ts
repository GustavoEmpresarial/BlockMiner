/**
 * Multiwall Ads — PTC monetization module (multiwall-ads.shop).
 *
 * Embed:  https://multiwall-ads.shop/api.php?page=main&api={API_KEY}&id={USER_ID}
 * Postback hash: md5(secret + user_id + transaction + amount + amountus)
 * Allowed IP (docs): 148.72.132.180
 * Response: "ok" | "er"
 *
 * Product credit: fixed BLK per completion (same as other external walls), not amountus.
 */
import { logger } from "../../core/logger/index.js";
import { OFFERWALL_BLK_PER_CLICK, blkForOfferwallClicks } from "../../shared/offerwallBlkPayout.js";
import { recordTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../tournaments/index.js";
import * as multiwallRepo from "./multiwall.repository.js";
import {
  buildMultiwallEmbedUrl,
  parseAllowedIps,
  verifyMultiwallHash,
} from "./multiwall.pure.js";
import type { MultiwallPostbackInput } from "./multiwall.types.js";

const log = logger.child("multiwall.service");

export const MULTIWALL_API_KEY = (process.env.MULTIWALL_API_KEY ?? "").trim();
const SECRET_KEY = (process.env.MULTIWALL_SECRET ?? "").trim();

/** Fixed BLK per completed offer — same product rule as other external walls. */
export const BLK_PER_CLICK = OFFERWALL_BLK_PER_CLICK;
const MAX_PAYOUT_USD_PER_CALLBACK = Number(process.env.MULTIWALL_MAX_PAYOUT_USD ?? "50");
export const HISTORY_PAGE_SIZE = 10;

/** PTC Instruction page postback IP. */
const ALLOWED_IPS = parseAllowedIps(process.env.MULTIWALL_ALLOWED_IPS ?? "148.72.132.180");

export function isIpAllowed(ip: string): boolean {
  return ALLOWED_IPS.has(ip);
}

export function verifyPostbackHash(input: MultiwallPostbackInput): boolean {
  return verifyMultiwallHash(
    SECRET_KEY,
    input.userId,
    input.transaction,
    input.amount,
    input.amountus,
    input.hashuser,
  );
}

export type PostbackResult =
  | { kind: "ok" }
  | { kind: "er" }
  | { kind: "empty" }
  | { kind: "internal" };

export async function processPostback(input: MultiwallPostbackInput, clientIp: string): Promise<PostbackResult> {
  const { hashuser, amount, amountus, transaction, userId: userIdRaw } = input;

  if (!hashuser || !transaction || !userIdRaw || amount === "" || amountus === "") {
    log.warn("postback.missing_params", { userIdRaw, transaction });
    return { kind: "er" };
  }

  if (!verifyPostbackHash(input)) {
    log.warn("postback.bad_hash", { userIdRaw, transaction, ip: clientIp });
    return { kind: "er" };
  }

  const userId = parseInt(userIdRaw, 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    log.warn("postback.invalid_user_id", { userIdRaw });
    return { kind: "er" };
  }

  const rawPayoutUsd = parseFloat(amount) || 0;
  const payoutUsd = Math.min(Math.max(0, rawPayoutUsd), MAX_PAYOUT_USD_PER_CALLBACK);
  if (payoutUsd < rawPayoutUsd) {
    log.warn("postback.payout_capped", { userId, transaction, requested: rawPayoutUsd, capped: payoutUsd });
  }

  const user = await multiwallRepo.findUserForPostback(userId);
  if (!user) {
    log.warn("postback.user_not_found", { userId });
    return { kind: "er" };
  }
  if (user.isBanned) {
    log.warn("postback.user_banned", { userId });
    return { kind: "ok" };
  }

  const blkToCredit = blkForOfferwallClicks(1);
  const blkAmount = Number(blkToCredit);
  let creditedAt = new Date();

  try {
    const row = await multiwallRepo.createCreditCallback({
      userId,
      transId: transaction,
      offerName: null,
      offerType: "ptc",
      payoutUsd,
      polPrice: 1,
      status: 1,
      clientIp,
      polDecimal: blkToCredit,
    });
    creditedAt = row.createdAt;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint") && msg.includes("trans_id")) {
      log.warn("postback.duplicate_ignored", { transaction, userId });
      return { kind: "ok" };
    }
    log.error("postback.transaction_failed", { transaction, userId, error: msg });
    return { kind: "internal" };
  }

  log.info("postback.credited", {
    userId,
    transaction,
    payoutUsd,
    amountus,
    blkCredited: blkToCredit.toFixed(8),
  });

  void recordTournamentAction({
    userId,
    provider: TOURNAMENT_ACTION_PROVIDER.MULTIWALL,
    actionCount: 1,
    executedAtUTC: creditedAt,
    providerEventId: transaction,
    metadata: { amountus, blkCredited: blkAmount },
  }).catch((err) => log.warn("tournament.action.failed", { transaction, error: String(err) }));

  return { kind: "ok" };
}

export async function getHistoryForUser(userId: number, page: number) {
  const safePage = Math.max(1, page || 1);
  const skip = (safePage - 1) * HISTORY_PAGE_SIZE;
  const { entries, total } = await multiwallRepo.listCallbackHistory(userId, skip, HISTORY_PAGE_SIZE);
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

  const { agg, offersToday, offersWeek, offersMonth } = await multiwallRepo.getStatsAggregates(
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
  return buildMultiwallEmbedUrl({
    apiKey: MULTIWALL_API_KEY,
    userId,
    baseUrl: process.env.MULTIWALL_OFFERWALL_BASE_URL,
  });
}
