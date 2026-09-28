/**
 * Ported from legacy/server/modules/internal-offerwall/application/internal-offerwall.service.ts
 * + domain/internal-offerwall.domain.ts + domain/internal-offerwall.period.ts +
 * domain/internal-offerwall.task-metadata.ts + internal-offerwall.admin-dto.ts + the reward-grant
 * and audit-snapshot repository files — folded flat per doctrine (no domain/application/infrastructure
 * split). Pure helpers (period key, usage snapshot, public shape, task-metadata normalize) are kept as
 * plain exported functions here since they have no DB/IO of their own and are trivially unit-testable.
 *
 * Deviation (documented, product decision): legacy's periodKey/dailyLimitPerUser reset already used a
 * UTC 00:00 boundary (via services/dailyTasks/dailyTaskPeriod.js), NOT a Brazil/America-Sao_Paulo
 * timezone — so no behavior change was needed here. This port reuses current/'s
 * shared/calendar/utcCalendar.ts (getUtcDayKey / getUtcPeriodResetAt) instead of duplicating that
 * math, which is the same UTC-00:00 day boundary legacy already computed.
 *
 * Reward crediting: BLK/POL go through a direct `tx.user.update({ data: { xBalance: { increment } } } })`
 * inside this module's own `prisma.$transaction`, mirroring shop.service.ts (there is no separate
 * `creditWallet()` export on wallet/index.ts). HASHRATE_TEMP grants create a `UserPowerGame` row
 * directly (same as legacy's reward-grant repository) — boosts/index.ts's
 * `resolveRewardExpiresAtForGrant` is for the daily power-boost feature (different reward shape,
 * different table semantics) and isn't reused here; legacy's internal-offerwall reward-grant never
 * called it either, it computed `playedAt + days` directly. Inventory/miner rewards are not supported
 * by this offer's rewardKind discriminator (BLK | POL | HASHRATE_TEMP only) — legacy never granted
 * inventory items from this module, so inventory/index.ts's `grantPurchasedInventoryItems` isn't used.
 */
import { Prisma } from "@prisma/client";
import type { PrismaClient, InternalOfferwallOffer } from "@prisma/client";
import prisma, { type TxClient } from "../../core/database/prisma.js";
import { getUtcDayKey, getUtcPeriodResetAt } from "../../shared/calendar/utcCalendar.js";
import { logger } from "../../core/logger/index.js";
import {
  ATTEMPT_STATUS_PENDING_REVIEW,
  ATTEMPT_STATUS_STARTED,
  COMPLETION_ADMIN_APPROVAL,
  COMPLETION_USER_SELF_CLAIM,
  OFFER_KIND_GENERAL_TASK,
  OFFER_KIND_PTC_IFRAME,
  REWARD_BLK,
  REWARD_HASHRATE_TEMP,
  REWARD_POL,
  RESET_TYPE_COOLDOWN,
  RESET_TYPE_DAILY,
  isInternalOfferwallEnabled,
  internalOfferwallDefaultBlkReward,
} from "./internal-offerwall.config.js";
import { syncUserBaseHashRate } from "../mining/index.js";
import { recordTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../tournaments/index.js";
import { notifyMiniPassInternalOfferwall } from "../mini-pass/index.js";
import { notifyDailyTaskInternalOfferwallCompleted } from "../tasks/index.js";
import {
  INTERNAL_OFFERWALL_ERROR,
  InternalOfferwallConflictError,
  InternalOfferwallRewardConfigError,
} from "./internal-offerwall.errors.js";
import {
  getIframeHostAllowlistCachedSync,
  refreshIframeHostAllowlistCache,
  upsertActiveFrameHost,
} from "./internal-offerwall.iframe-allowlist.js";
import { isAllowHttpIframe, validateIframeUrl } from "./internal-offerwall.iframe-validate.js";
import * as repo from "./internal-offerwall.repository.js";
import { notifyInternalOfferwallCompletion } from "./internal-offerwall.webhook.js";
import type {
  AdminOperationResult,
  CompletionRow,
  NormalizeTaskMetadataResult,
  OfferLimitConfig,
  ParseAdminOfferBodyResult,
  UsageSnapshot,
  UserAbandonAttemptResult,
  UserListOffersResult,
  UserMarkPartnerOpenedResult,
  UserStartOfferResult,
  UserSubmitAttemptResult,
} from "./internal-offerwall.types.js";

const log = logger.child("internal-offerwall.service");

// ---------------------------------------------------------------------------
// Period / UTC day boundary (see file header — intentional UTC-00:00 decision)
// ---------------------------------------------------------------------------

export function getInternalOfferwallPeriodKey(now: Date = new Date()): string {
  return getUtcDayKey(now);
}

export function getNextInternalOfferwallResetAt(now: Date = new Date()): Date {
  return getUtcPeriodResetAt(getUtcDayKey(now));
}

export function msUntilInternalOfferwallReset(now: Date = new Date()): number {
  return Math.max(0, getNextInternalOfferwallResetAt(now).getTime() - now.getTime());
}

export function countDailyCompletions(
  completionRows: CompletionRow[],
  periodKey: string,
  resetType: string,
): number {
  if (resetType !== RESET_TYPE_DAILY) {
    return completionRows.filter((r) => r.periodKey === periodKey).length;
  }
  return completionRows.filter((r) => {
    if (r.periodKey === periodKey) return true;
    if (!r.completedAt) return false;
    return r.completedAt.toISOString().slice(0, 10) === periodKey;
  }).length;
}

// ---------------------------------------------------------------------------
// Pure domain helpers
// ---------------------------------------------------------------------------

export function assertMinViewForSubmit({
  offerKind,
  startedAt,
  partnerOpenedAt,
  now,
  minViewSeconds,
}: {
  offerKind: string | null | undefined;
  startedAt: Date;
  partnerOpenedAt: Date | null;
  now: Date;
  minViewSeconds: number | null | undefined;
}): { ok: true } | { ok: false; code: string } {
  const isPtc = String(offerKind || "").toUpperCase() === OFFER_KIND_PTC_IFRAME;
  const min = Math.max(0, Number(minViewSeconds) || 0);

  if (isPtc) {
    if (!partnerOpenedAt) {
      return { ok: false, code: INTERNAL_OFFERWALL_ERROR.PARTNER_NOT_OPENED };
    }
    const elapsedSec = (now.getTime() - partnerOpenedAt.getTime()) / 1000;
    if (elapsedSec < min) {
      return { ok: false, code: INTERNAL_OFFERWALL_ERROR.MIN_VIEW_NOT_MET };
    }
    return { ok: true };
  }

  const elapsedSec = (now.getTime() - startedAt.getTime()) / 1000;
  if (elapsedSec < min) {
    return { ok: false, code: INTERNAL_OFFERWALL_ERROR.MIN_VIEW_NOT_MET };
  }
  return { ok: true };
}

export function getOfferLimitConfig(offer: {
  dailyLimitPerUser?: number | string | null;
  taskMetadata?: unknown;
}): OfferLimitConfig {
  const meta =
    offer?.taskMetadata && typeof offer.taskMetadata === "object"
      ? (offer.taskMetadata as Record<string, unknown>)
      : {};
  const rt = String(meta.resetType || RESET_TYPE_DAILY).trim().toUpperCase();
  const resetType = rt === RESET_TYPE_COOLDOWN ? RESET_TYPE_COOLDOWN : RESET_TYPE_DAILY;

  const rawMax = Number(offer?.dailyLimitPerUser);
  const maxPerPeriod = Number.isFinite(rawMax) ? Math.min(50, Math.max(1, Math.floor(rawMax))) : 1;

  let cooldownWindowSec: number | null = null;
  if (resetType === RESET_TYPE_COOLDOWN) {
    const n = Math.floor(Number(meta.cooldownSeconds));
    cooldownWindowSec = Number.isFinite(n) ? Math.min(86_400 * 7, Math.max(60, n)) : 3600;
  }

  return { resetType, maxPerPeriod, cooldownWindowSec };
}

export function computeUsageSnapshot(args: {
  resetType: string;
  maxPerPeriod: number;
  cooldownWindowSec: number | null;
  completionRows: CompletionRow[];
  periodKey: string;
  now: Date;
  hasOpenAttempt: boolean;
}): UsageSnapshot {
  const { resetType, maxPerPeriod, cooldownWindowSec, completionRows, periodKey, now, hasOpenAttempt } = args;
  const nowMs = now.getTime();

  let completedCount = 0;
  let secondsUntilAvailable: number | null = null;

  if (resetType === RESET_TYPE_DAILY) {
    completedCount = countDailyCompletions(completionRows, periodKey, resetType);
    if (completedCount >= maxPerPeriod && !hasOpenAttempt) {
      const next = getNextInternalOfferwallResetAt(now);
      secondsUntilAvailable = Math.max(0, Math.ceil((next.getTime() - nowMs) / 1000));
    }
  } else {
    const wMs = (cooldownWindowSec || 3600) * 1000;
    const threshold = nowMs - wMs;
    const inWindow = completionRows
      .filter((r) => r.completedAt && r.completedAt.getTime() >= threshold)
      .map((r) => r.completedAt!.getTime())
      .sort((a, b) => a - b);
    completedCount = inWindow.length;
    if (completedCount >= maxPerPeriod && !hasOpenAttempt) {
      const idx = Math.max(0, inWindow.length - maxPerPeriod);
      const boundary = inWindow[idx] + wMs;
      secondsUntilAvailable = Math.max(0, Math.ceil((boundary - nowMs) / 1000));
    }
  }

  const atLimit = completedCount >= maxPerPeriod;
  const canStartNew = !atLimit || Boolean(hasOpenAttempt);

  return {
    completedCount,
    maxPerPeriod,
    resetType,
    cooldownWindowSec,
    secondsUntilAvailable: canStartNew ? null : secondsUntilAvailable,
    canStartNew,
  };
}

export function publicOfferShape(
  row: InternalOfferwallOffer,
  usageSnap: UsageSnapshot,
): Record<string, unknown> {
  const meta = row.taskMetadata && typeof row.taskMetadata === "object" ? row.taskMetadata : null;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    iframeUrl: row.kind === OFFER_KIND_PTC_IFRAME ? row.iframeUrl : null,
    minViewSeconds: row.minViewSeconds,
    rewardKind: row.rewardKind,
    rewardBlkAmount: row.rewardBlkAmount?.toString?.() ?? null,
    rewardPolAmount: row.rewardPolAmount?.toString?.() ?? null,
    rewardHashRate: row.rewardHashRate,
    rewardHashRateDays: row.rewardHashRateDays,
    completionMode: row.completionMode,
    sortOrder: row.sortOrder,
    taskMetadata: meta,
    dailyLimitPerUser: row.dailyLimitPerUser,
    maxExecutionsPerPeriod: row.dailyLimitPerUser,
    resetType: usageSnap.resetType,
    cooldownSeconds: usageSnap.cooldownWindowSec,
    usage: {
      completedCount: usageSnap.completedCount,
      maxPerPeriod: usageSnap.maxPerPeriod,
      secondsUntilAvailable: usageSnap.secondsUntilAvailable,
      canStartNew: usageSnap.canStartNew,
    },
  };
}

function asObject(raw: unknown): Record<string, unknown> | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeTaskMetadata(
  kind: string,
  raw: unknown,
  options: { allowHttp?: boolean; allowedHosts?: Set<string> } = {},
): NormalizeTaskMetadataResult {
  const obj = asObject(raw);
  if (!obj) return { ok: true, value: null };

  const allowHttp = options.allowHttp ?? isAllowHttpIframe();
  const allowedHosts = options.allowedHosts ?? getIframeHostAllowlistCachedSync();

  const out: Record<string, unknown> = {};

  const actionsRaw = obj.requiredActions;
  if (actionsRaw !== undefined) {
    if (!Array.isArray(actionsRaw)) return { ok: false, message: "taskMetadata.requiredActions must be an array." };
    if (actionsRaw.length > 15) return { ok: false, message: "taskMetadata.requiredActions allows at most 15 items." };
    const requiredActions: string[] = [];
    for (const a of actionsRaw) {
      const s = String(a ?? "").trim();
      if (!s) continue;
      if (s.length > 500) return { ok: false, message: "Each required action must be at most 500 characters." };
      requiredActions.push(s);
    }
    if (requiredActions.length) out.requiredActions = requiredActions;
  }

  const countriesRaw = obj.targetCountryCodes;
  if (countriesRaw !== undefined) {
    if (!Array.isArray(countriesRaw)) return { ok: false, message: "taskMetadata.targetCountryCodes must be an array." };
    if (countriesRaw.length > 60) return { ok: false, message: "taskMetadata.targetCountryCodes allows at most 60 items." };
    const targetCountryCodes: string[] = [];
    for (const c of countriesRaw) {
      const u = String(c ?? "").trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(u)) return { ok: false, message: "targetCountryCodes must be ISO 3166-1 alpha-2 codes." };
      targetCountryCodes.push(u);
    }
    if (targetCountryCodes.length) out.targetCountryCodes = targetCountryCodes;
  }

  const ext = obj.externalInfoUrl;
  if (ext !== undefined && ext !== null && String(ext).trim()) {
    if (kind !== OFFER_KIND_GENERAL_TASK) {
      return { ok: false, message: "externalInfoUrl is only allowed for GENERAL_TASK offers." };
    }
    const vr = validateIframeUrl(String(ext), { allowHttp, allowedHosts });
    if (!vr.ok) {
      return { ok: false, message: vr.message ?? "Invalid external URL.", ...(vr.code ? { code: vr.code } : {}), ...(vr.host ? { host: vr.host } : {}) };
    }
    out.externalInfoUrl = vr.url;
  }

  const verificationNote = obj.verificationNote;
  if (verificationNote !== undefined && verificationNote !== null && String(verificationNote).trim()) {
    out.verificationNote = String(verificationNote).trim().slice(0, 2000);
  }

  if (obj.resetType !== undefined && obj.resetType !== null && String(obj.resetType).trim() !== "") {
    const rt = String(obj.resetType).trim().toUpperCase();
    if (rt !== RESET_TYPE_DAILY && rt !== RESET_TYPE_COOLDOWN) {
      return { ok: false, message: "taskMetadata.resetType must be DAILY or COOLDOWN." };
    }
    out.resetType = rt;
  }

  if (obj.cooldownSeconds !== undefined && obj.cooldownSeconds !== null && String(obj.cooldownSeconds).trim() !== "") {
    const n = Math.floor(Number(obj.cooldownSeconds));
    if (!Number.isFinite(n)) return { ok: false, message: "taskMetadata.cooldownSeconds must be a number." };
    out.cooldownSeconds = Math.min(86_400 * 7, Math.max(60, n));
  }

  return { ok: true, value: Object.keys(out).length ? out : null };
}

// ---------------------------------------------------------------------------
// Reward crediting (financial mutation, always inside the caller's tx)
// ---------------------------------------------------------------------------

async function grantInternalOfferwallRewardInTx(
  tx: TxClient,
  args: {
    userId: number;
    rewardKind?: string | null;
    rewardBlkAmount?: Prisma.Decimal | number | string | null;
    rewardPolAmount?: Prisma.Decimal | number | string | null;
    rewardHashRate?: number | null;
    rewardHashRateDays?: number | null;
  },
): Promise<{ kind: string; polDelta: number }> {
  const { userId, rewardKind } = args;
  const kind = String(rewardKind || "").toUpperCase();

  if (kind === REWARD_BLK || kind === REWARD_POL) {
    // Platform policy: internal offerwall pays BLK only. Legacy POL rows are
    // credited as BLK (same numeric amount) so in-flight attempts still settle.
    const amt =
      kind === REWARD_BLK
        ? args.rewardBlkAmount
        : args.rewardBlkAmount && new Prisma.Decimal(args.rewardBlkAmount.toString()).gt(0)
          ? args.rewardBlkAmount
          : args.rewardPolAmount;

    if (!amt || new Prisma.Decimal(amt.toString()).lte(0)) {
      throw new InternalOfferwallRewardConfigError("REWARD_BLK_INVALID");
    }

    await tx.user.update({
      where: { id: userId },
      data: { blkBalance: { increment: new Prisma.Decimal(amt.toString()) } },
    });
    return { kind: REWARD_BLK, polDelta: 0 };
  }

  if (kind === REWARD_HASHRATE_TEMP) {
    // Hashrate rewards disabled — settle as standard BLK instead.
    const fallback = new Prisma.Decimal(String(internalOfferwallDefaultBlkReward()));
    await tx.user.update({
      where: { id: userId },
      data: { blkBalance: { increment: fallback } },
    });
    return { kind: REWARD_BLK, polDelta: 0 };
  }

  throw new InternalOfferwallRewardConfigError("REWARD_KIND_UNSUPPORTED");
}

export async function userListOffers(userId: number): Promise<UserListOffersResult> {
  if (!isInternalOfferwallEnabled()) {
    return { ok: false, code: INTERNAL_OFFERWALL_ERROR.FEATURE_DISABLED, offers: [], openAttempts: [] };
  }

  const now = new Date();
  const periodKey = getInternalOfferwallPeriodKey(now);

  await repo.abandonStaleStartedAttempts(userId, periodKey);

  const offers = await repo.findActiveOffers();
  const openRows = await repo.findOpenAttemptsForUser(userId, periodKey);

  const offerIds = offers.map((o) => o.id);
  const since = new Date(now.getTime() - repo.COMPLETION_HISTORY_LOOKBACK_MS);
  const compRows = await repo.findCompletionRowsForOffers(userId, offerIds, since);

  const completionByOffer = new Map<number, CompletionRow[]>();
  for (const r of compRows) {
    const list = completionByOffer.get(r.offerId) || [];
    list.push({ periodKey: r.periodKey, completedAt: r.completedAt });
    completionByOffer.set(r.offerId, list);
  }

  const hasOpenByOffer = new Map<number, boolean>();
  for (const o of openRows) hasOpenByOffer.set(o.offerId, true);

  const openAttempts = openRows.map((open) => {
    const cfg = getOfferLimitConfig(open.offer);
    const rows = completionByOffer.get(open.offerId) || [];
    const usageSnap = computeUsageSnapshot({ ...cfg, completionRows: rows, periodKey, now, hasOpenAttempt: true });
    return {
      id: open.id,
      offerId: open.offerId,
      status: open.status,
      startedAt: open.startedAt.toISOString(),
      partnerOpenedAt: open.partnerOpenedAt ? open.partnerOpenedAt.toISOString() : null,
      offer: publicOfferShape(open.offer, usageSnap),
    };
  });

  return {
    ok: true,
    dailyReset: {
      timezone: "UTC",
      localDate: getUtcDayKey(now),
      nextResetAt: getNextInternalOfferwallResetAt(now).toISOString(),
      nextResetInMs: msUntilInternalOfferwallReset(now),
    },
    offers: offers.map((row) => {
      const cfg = getOfferLimitConfig(row);
      const rows = completionByOffer.get(row.id) || [];
      const usageSnap = computeUsageSnapshot({
        ...cfg,
        completionRows: rows,
        periodKey,
        now,
        hasOpenAttempt: Boolean(hasOpenByOffer.get(row.id)),
      });
      return publicOfferShape(row, usageSnap);
    }),
    openAttempts,
  };
}

function isPrismaSerializationConflict(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2034";
}

async function userStartOfferOnceSerializable(
  userId: number,
  offerId: number,
): Promise<UserStartOfferResult> {
  const now = new Date();
  const periodKey = getInternalOfferwallPeriodKey(now);
  const since = new Date(now.getTime() - repo.COMPLETION_HISTORY_LOOKBACK_MS);

  return prisma.$transaction(
    async (tx) => {
      const offer = await repo.findOfferByIdActiveTx(tx, offerId);
      if (!offer) {
        return {
          ok: false,
          status: 404,
          code: INTERNAL_OFFERWALL_ERROR.TASK_NOT_AVAILABLE,
          message: "Offer not found or inactive.",
        };
      }

      const cfg = getOfferLimitConfig(offer);
      const completionRows = await repo.findCompletionRowsForOfferTx(tx, userId, offerId, since);
      const existing = await repo.findOpenAttemptTx(tx, userId, offerId, periodKey);
      const hasOpen = Boolean(existing);
      const snap = computeUsageSnapshot({ ...cfg, completionRows, periodKey, now, hasOpenAttempt: hasOpen });

      if (!snap.canStartNew && !hasOpen) {
        return {
          ok: false,
          status: 429,
          code: INTERNAL_OFFERWALL_ERROR.TASK_LIMIT_REACHED,
          message: "Execution limit reached for this offer.",
          secondsUntilReset: snap.secondsUntilAvailable ?? 0,
        };
      }

      const row = existing ?? (await repo.createAttemptTx(tx, { userId, offerId, periodKey, startedAt: now }));

      return {
        ok: true,
        attempt: {
          id: row.id,
          offerId: row.offerId,
          status: row.status,
          startedAt: row.startedAt.toISOString(),
          partnerOpenedAt: row.partnerOpenedAt ? row.partnerOpenedAt.toISOString() : null,
        },
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 12_000 },
  );
}

export async function userStartOffer(userId: number, offerId: number): Promise<UserStartOfferResult> {
  if (!isInternalOfferwallEnabled()) {
    return {
      ok: false,
      status: 403,
      code: INTERNAL_OFFERWALL_ERROR.TASK_NOT_AVAILABLE,
      message: "This feature is disabled.",
    };
  }

  const maxTries = 4;
  for (let i = 0; i < maxTries; i++) {
    try {
      return await userStartOfferOnceSerializable(userId, offerId);
    } catch (e) {
      if (isPrismaSerializationConflict(e) && i < maxTries - 1) continue;
      throw e;
    }
  }

  return {
    ok: false,
    status: 503,
    code: INTERNAL_OFFERWALL_ERROR.TASK_NOT_AVAILABLE,
    message: "Could not start the task. Try again.",
  };
}

export async function userMarkPartnerOpened(
  userId: number,
  attemptId: number,
): Promise<UserMarkPartnerOpenedResult> {
  if (!isInternalOfferwallEnabled()) {
    return { ok: false, status: 403, code: INTERNAL_OFFERWALL_ERROR.FEATURE_DISABLED, message: "This feature is disabled." };
  }

  const attempt = await repo.findAttemptForUser(userId, attemptId);
  if (!attempt || !attempt.offer?.isActive) {
    return { ok: false, status: 404, code: INTERNAL_OFFERWALL_ERROR.ATTEMPT_NOT_FOUND, message: "Attempt not found." };
  }
  if (attempt.status !== ATTEMPT_STATUS_STARTED) {
    return { ok: false, status: 400, code: INTERNAL_OFFERWALL_ERROR.INVALID_STATE, message: "This attempt cannot be updated now." };
  }
  if (String(attempt.offer.kind).toUpperCase() !== OFFER_KIND_PTC_IFRAME) {
    return {
      ok: false,
      status: 400,
      code: INTERNAL_OFFERWALL_ERROR.NOT_PTC_OFFER,
      message: "Partner open tracking applies only to paid-view offers.",
    };
  }
  if (!String(attempt.offer.iframeUrl || "").trim()) {
    return { ok: false, status: 400, code: INTERNAL_OFFERWALL_ERROR.NO_PARTNER_URL, message: "This offer has no partner URL configured." };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => repo.updatePartnerOpenedAtTx(tx, attemptId, now));
  return { ok: true, partnerOpenedAt: now.toISOString() };
}

export async function userAbandonAttempt(
  userId: number,
  attemptId: number,
): Promise<UserAbandonAttemptResult> {
  if (!isInternalOfferwallEnabled()) {
    return { ok: false, status: 403, code: INTERNAL_OFFERWALL_ERROR.FEATURE_DISABLED, message: "This feature is disabled." };
  }
  if (!Number.isInteger(attemptId) || attemptId < 1) {
    return { ok: false, status: 400, code: INTERNAL_OFFERWALL_ERROR.INVALID_ATTEMPT, message: "Invalid attempt id." };
  }

  const attempt = await repo.findAttemptForUserSlim(userId, attemptId);
  if (!attempt) {
    return { ok: false, status: 404, code: INTERNAL_OFFERWALL_ERROR.ATTEMPT_NOT_FOUND, message: "Attempt not found." };
  }
  if (attempt.status === ATTEMPT_STATUS_PENDING_REVIEW) {
    return {
      ok: false,
      status: 400,
      code: INTERNAL_OFFERWALL_ERROR.CANNOT_ABANDON_PENDING_REVIEW,
      message: "This submission is waiting for review and cannot be cancelled from here.",
    };
  }
  if (attempt.status !== ATTEMPT_STATUS_STARTED) {
    return { ok: true, alreadyCleared: true, deleted: false };
  }

  const del = await repo.deleteStartedAttempt(userId, attemptId);
  return { ok: true, alreadyCleared: false, deleted: del.count > 0 };
}

export async function userSubmitAttempt(
  userId: number,
  attemptId: number,
): Promise<UserSubmitAttemptResult> {
  if (!isInternalOfferwallEnabled()) {
    return { ok: false, status: 403, code: INTERNAL_OFFERWALL_ERROR.FEATURE_DISABLED, message: "This feature is disabled." };
  }

  const attempt = await repo.findAttemptForUser(userId, attemptId);
  if (!attempt || !attempt.offer?.isActive) {
    return { ok: false, status: 404, code: INTERNAL_OFFERWALL_ERROR.ATTEMPT_NOT_FOUND, message: "Attempt not found." };
  }
  if (attempt.status !== ATTEMPT_STATUS_STARTED) {
    return { ok: false, status: 400, code: INTERNAL_OFFERWALL_ERROR.INVALID_STATE, message: "This attempt cannot be submitted now." };
  }

  const now = new Date();
  const minView = assertMinViewForSubmit({
    offerKind: attempt.offer.kind,
    startedAt: attempt.startedAt,
    partnerOpenedAt: attempt.partnerOpenedAt,
    now,
    minViewSeconds: attempt.offer.minViewSeconds,
  });

  if (!minView.ok) {
    if (minView.code === INTERNAL_OFFERWALL_ERROR.PARTNER_NOT_OPENED) {
      return {
        ok: false,
        status: 400,
        code: INTERNAL_OFFERWALL_ERROR.PARTNER_NOT_OPENED,
        message: "Open the partner page using the button, wait on this tab, then submit.",
      };
    }
    return {
      ok: false,
      status: 400,
      code: INTERNAL_OFFERWALL_ERROR.MIN_VIEW_NOT_MET,
      message: "Keep the task open for the required time before submitting.",
    };
  }

  if (attempt.offer.completionMode === COMPLETION_ADMIN_APPROVAL) {
    const snap = await repo.buildUserAuditSnapshotJson(userId);
    await prisma.$transaction(async (tx) => repo.markPendingReviewTx(tx, attempt.id, now, snap));
    return {
      ok: true,
      status: "PENDING_REVIEW",
      message: "Submitted for review. You will receive the reward after approval.",
    };
  }

  const snap = await repo.buildUserAuditSnapshotJson(userId);
  try {
    await prisma.$transaction(async (tx) => {
      const fresh = await repo.findStartedAttemptTx(tx, attemptId, userId);
      if (!fresh) throw new InternalOfferwallConflictError();
      await grantInternalOfferwallRewardInTx(tx, {
        userId,
        rewardKind: attempt.offer.rewardKind,
        rewardBlkAmount: attempt.offer.rewardBlkAmount,
        rewardPolAmount: attempt.offer.rewardPolAmount,
        rewardHashRate: attempt.offer.rewardHashRate,
        rewardHashRateDays: attempt.offer.rewardHashRateDays,
      });
      await repo.markCompletedTx(tx, attemptId, {
        submittedAt: now,
        completedAt: now,
        rewardGrantedAt: now,
        auditSnapshot: snap,
      });
    });
  } catch (e) {
    if (e instanceof InternalOfferwallConflictError) {
      return { ok: false, status: 409, code: INTERNAL_OFFERWALL_ERROR.CONFLICT, message: "Attempt was already updated." };
    }
    if (e instanceof InternalOfferwallRewardConfigError) {
      return {
        ok: false,
        status: 400,
        code: INTERNAL_OFFERWALL_ERROR.REWARD_CONFIG_INVALID,
        message: "This offer has an invalid reward configuration.",
      };
    }
    throw e;
  }

  await dispatchCompletionHooks({
    userId,
    attemptId,
    offerId: attempt.offerId,
    offerKind: attempt.offer.kind,
    rewardKind: attempt.offer.rewardKind,
    now,
    event: "INTERNAL_OFFERWALL_SELF_CLAIM_COMPLETED",
  });

  log.info("internal_offerwall_attempt_completed", { userId, attemptId, offerId: attempt.offerId });
  return { ok: true, status: "COMPLETED", message: "Reward granted." };
}

async function dispatchCompletionHooks(args: {
  userId: number;
  attemptId: number;
  offerId: number;
  offerKind: string;
  rewardKind: string | null | undefined;
  now: Date;
  event: string;
  approvedByAdmin?: boolean;
}): Promise<void> {
  const { userId, attemptId, offerId, offerKind, rewardKind, now, event, approvedByAdmin } = args;

  void recordTournamentAction({
    userId,
    provider: TOURNAMENT_ACTION_PROVIDER.INTERNAL,
    actionCount: 1,
    executedAtUTC: now,
    providerEventId: String(attemptId),
    metadata: { offerId, ...(approvedByAdmin ? { approvedByAdmin: true } : {}), timestampSource: "completed_at" },
  }).catch((err) => log.warn("tournament.action.failed", { attemptId, error: String(err) }));

  void notifyMiniPassInternalOfferwall(userId, attemptId).catch((err) =>
    log.warn("mini_pass.hook.failed", { attemptId, error: String(err) }),
  );
  void notifyDailyTaskInternalOfferwallCompleted(userId, attemptId, offerId).catch((err) =>
    log.warn("daily_task.hook.failed", { attemptId, error: String(err) }),
  );

  if (String(rewardKind || "").toUpperCase() === REWARD_HASHRATE_TEMP) {
    await syncUserBaseHashRate(userId).catch((err) => {
      log.warn("internal_offerwall.sync_hashrate_failed", { userId, attemptId, error: String(err) });
    });
  }

  notifyInternalOfferwallCompletion({
    event,
    attemptId,
    userId,
    offerId,
    offerKind,
    completedAtIso: now.toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Admin flows
// ---------------------------------------------------------------------------

export async function adminListFrameHosts() {
  return repo.adminListFrameHosts();
}

export async function adminDeactivateFrameHostById(id: number): Promise<AdminOperationResult> {
  if (!Number.isInteger(id) || id < 1) {
    return { ok: false, status: 400, message: "Invalid frame host id." };
  }
  const row = await repo.adminFindFrameHostById(id);
  if (!row) {
    return { ok: false, status: 404, message: "Frame host not found." };
  }
  await repo.adminDeactivateFrameHost(id);
  await refreshIframeHostAllowlistCache(prisma);
  return { ok: true };
}

export async function adminListOffers(): Promise<InternalOfferwallOffer[]> {
  return repo.adminListOffers();
}

export async function adminCreateOffer(
  data: Prisma.InternalOfferwallOfferUncheckedCreateInput,
): Promise<InternalOfferwallOffer> {
  return repo.adminCreateOffer(data);
}

export async function adminPatchOffer(
  id: number,
  patch: Prisma.InternalOfferwallOfferUncheckedUpdateInput,
): Promise<InternalOfferwallOffer> {
  return repo.adminPatchOffer(id, patch);
}

export async function adminFindOfferById(id: number): Promise<InternalOfferwallOffer | null> {
  return repo.adminFindOfferById(id);
}

/** Idempotent — aligns existing offers to the platform BLK rate (skips rows already on it). */
export async function applyInternalOfferwallStandardBlkReward(): Promise<{ updated: number; amount: number }> {
  if (!isInternalOfferwallEnabled()) {
    return { updated: 0, amount: internalOfferwallDefaultBlkReward() };
  }
  const amount = internalOfferwallDefaultBlkReward();
  const dec = new Prisma.Decimal(String(amount));
  const result = await prisma.internalOfferwallOffer.updateMany({
    where: {
      NOT: {
        rewardKind: REWARD_BLK,
        rewardBlkAmount: dec,
      },
    },
    data: {
      rewardKind: REWARD_BLK,
      rewardBlkAmount: dec,
      rewardPolAmount: null,
      rewardHashRate: null,
      rewardHashRateDays: null,
    },
  });
  if (result.count > 0) {
    log.info("internal_offerwall_standard_blk_reward_applied", { amount, updated: result.count });
  }
  return { updated: result.count, amount };
}

export async function adminListAttempts(args: {
  status?: string;
  offerId?: number;
  limit?: number;
}) {
  return repo.adminListAttempts(args);
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = parseInt(String(v ?? ""), 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function buildTaskMetadataInputForNormalize(b: Record<string, unknown>): Record<string, unknown> | null {
  const metaIn = b.taskMetadata !== undefined ? b.taskMetadata : b.task_metadata;
  const base = metaIn != null && typeof metaIn === "object" && !Array.isArray(metaIn) ? { ...(metaIn as Record<string, unknown>) } : {};
  if (b.resetType !== undefined) base.resetType = b.resetType;
  if (b.cooldownSeconds !== undefined) base.cooldownSeconds = b.cooldownSeconds;
  return Object.keys(base).length ? base : null;
}

/** Business validation for admin offer create/patch bodies — mirrors legacy's admin-dto.ts
 *  parseAdminOfferBody (host allowlist auto-registration, reward cross-field checks). */
export async function parseAdminOfferBody(
  prismaCl: PrismaClient | TxClient,
  body: unknown,
): Promise<ParseAdminOfferBodyResult> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, message: "Invalid JSON body." };
  }
  const b = body as Record<string, unknown>;

  const kind = String(b.kind || "").trim().toUpperCase();
  if (kind !== OFFER_KIND_PTC_IFRAME && kind !== OFFER_KIND_GENERAL_TASK) {
    return { ok: false, status: 400, message: "Invalid offer kind." };
  }

  const title = String(b.title || "").trim();
  if (!title || title.length > 200) {
    return { ok: false, status: 400, message: "Title is required (max 200 chars)." };
  }

  const description = b.description === undefined || b.description === null ? null : String(b.description).trim().slice(0, 8000) || null;

  await refreshIframeHostAllowlistCache(prismaCl);
  const allowHttp = isAllowHttpIframe();

  let iframeUrl: string | null = null;
  if (kind === OFFER_KIND_PTC_IFRAME) {
    let hosts = getIframeHostAllowlistCachedSync();
    let vr = validateIframeUrl(String(b.iframeUrl || ""), { allowHttp, allowedHosts: hosts });
    if (!vr.ok && vr.code === "IFRAME_URL_NOT_ALLOWED" && vr.host) {
      const up = await upsertActiveFrameHost(prismaCl, vr.host);
      if (!up.ok) {
        return { ok: false, status: 400, message: String(up.message ?? "Invalid frame host."), code: "IFRAME_HOST_INVALID" };
      }
      await refreshIframeHostAllowlistCache(prismaCl);
      hosts = getIframeHostAllowlistCachedSync();
      vr = validateIframeUrl(String(b.iframeUrl || ""), { allowHttp, allowedHosts: hosts });
    }
    if (!vr.ok) {
      const base = { ok: false as const, status: 400, message: vr.message ?? "Invalid iframe URL.", code: vr.code };
      if (vr.code === "IFRAME_URL_NOT_ALLOWED" && vr.host) {
        return { ...base, details: { host: vr.host } };
      }
      return base;
    }
    iframeUrl = vr.url ?? null;
  } else if (b.iframeUrl !== undefined && String(b.iframeUrl).trim()) {
    return { ok: false, status: 400, message: "General tasks must not include an iframe URL." };
  }

  const minViewSeconds = clampInt(b.minViewSeconds, 0, 7200, 10);
  const maxExecRaw =
    b.maxExecutionsPerPeriod !== undefined && b.maxExecutionsPerPeriod !== null && String(b.maxExecutionsPerPeriod).trim() !== ""
      ? b.maxExecutionsPerPeriod
      : b.dailyLimitPerUser;
  const dailyLimitPerUser = clampInt(maxExecRaw, 1, 50, 3);
  const sortOrder = clampInt(b.sortOrder, 0, 99999, 0);

  // Internal offerwall pays BLK only (POL / HASHRATE_TEMP rejected at admin write).
  const rewardKindRaw = String(b.rewardKind || REWARD_BLK).trim().toUpperCase();
  if (rewardKindRaw !== REWARD_BLK && rewardKindRaw !== "" && rewardKindRaw !== REWARD_POL && rewardKindRaw !== REWARD_HASHRATE_TEMP) {
    return { ok: false, status: 400, message: "Invalid reward kind (use BLK)." };
  }
  if (rewardKindRaw === REWARD_POL || rewardKindRaw === REWARD_HASHRATE_TEMP) {
    return { ok: false, status: 400, message: "Internal offerwall rewards must be BLK only." };
  }
  const rewardKind = REWARD_BLK;

  const data: Prisma.InternalOfferwallOfferUncheckedCreateInput = {
    kind,
    title,
    description,
    iframeUrl,
    minViewSeconds,
    rewardKind,
    dailyLimitPerUser,
    sortOrder,
    isActive: typeof b.isActive === "boolean" ? b.isActive : true,
    completionMode:
      String(b.completionMode || "").trim().toUpperCase() === COMPLETION_ADMIN_APPROVAL
        ? COMPLETION_ADMIN_APPROVAL
        : COMPLETION_USER_SELF_CLAIM,
    rewardPolAmount: null,
    rewardHashRate: null,
    rewardHashRateDays: null,
  };

  {
    const raw = b.rewardBlkAmount;
    const a =
      raw !== undefined && raw !== null && String(raw).trim() !== ""
        ? parseFloat(String(raw))
        : internalOfferwallDefaultBlkReward();
    if (!Number.isFinite(a) || a <= 0) {
      return { ok: false, status: 400, message: "BLK reward requires a positive rewardBlkAmount." };
    }
    data.rewardBlkAmount = new Prisma.Decimal(String(a));
  }

  const metaIn = buildTaskMetadataInputForNormalize(b);
  const metaOpts = { allowHttp, allowedHosts: getIframeHostAllowlistCachedSync() };
  let meta = normalizeTaskMetadata(kind, metaIn, metaOpts);
  if (!meta.ok && meta.code === "IFRAME_URL_NOT_ALLOWED" && meta.host) {
    const up = await upsertActiveFrameHost(prismaCl, meta.host);
    if (!up.ok) {
      return { ok: false, status: 400, message: String(up.message ?? "Invalid frame host."), code: "IFRAME_HOST_INVALID" };
    }
    await refreshIframeHostAllowlistCache(prismaCl);
    metaOpts.allowedHosts = getIframeHostAllowlistCachedSync();
    meta = normalizeTaskMetadata(kind, metaIn, metaOpts);
  }
  if (!meta.ok) {
    const base = { ok: false as const, status: 400, message: meta.message ?? "Invalid task metadata." };
    if (meta.code === "IFRAME_URL_NOT_ALLOWED" && meta.host) {
      return { ...base, code: meta.code, details: { host: meta.host } };
    }
    return base;
  }

  const metaVal = meta.value && typeof meta.value === "object" ? { ...meta.value } : null;
  if (metaVal?.resetType === RESET_TYPE_COOLDOWN) {
    if (metaVal.cooldownSeconds == null || !Number.isFinite(Number(metaVal.cooldownSeconds))) {
      return { ok: false, status: 400, message: "COOLDOWN reset requires cooldownSeconds between 60 and 604800." };
    }
  } else if (metaVal && metaVal.resetType !== RESET_TYPE_COOLDOWN) {
    delete metaVal.cooldownSeconds;
  }
  if (metaVal && Object.keys(metaVal).length) {
    data.taskMetadata = metaVal as Prisma.InputJsonValue;
  }

  return { ok: true, data };
}

export async function adminApproveAttempt(attemptId: number): Promise<AdminOperationResult> {
  const attempt = await repo.findPendingAttemptWithOffer(attemptId);
  if (!attempt || !attempt.offer) {
    return { ok: false, status: 404, message: "Pending attempt not found." };
  }
  if (!attempt.offer.isActive) {
    return { ok: false, status: 400, message: "Offer is inactive." };
  }

  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const row = await repo.findPendingAttemptTx(tx, attemptId);
      if (!row) throw new InternalOfferwallConflictError("gone");
      await grantInternalOfferwallRewardInTx(tx, {
        userId: attempt.userId,
        rewardKind: attempt.offer.rewardKind,
        rewardBlkAmount: attempt.offer.rewardBlkAmount,
        rewardPolAmount: attempt.offer.rewardPolAmount,
        rewardHashRate: attempt.offer.rewardHashRate,
        rewardHashRateDays: attempt.offer.rewardHashRateDays,
      });
      await repo.markApprovedTx(tx, attemptId, now, now);
    });
  } catch (e) {
    if (e instanceof InternalOfferwallConflictError) {
      return { ok: false, status: 409, message: "Attempt was already updated." };
    }
    if (e instanceof InternalOfferwallRewardConfigError) {
      return { ok: false, status: 400, message: "This offer has an invalid reward configuration." };
    }
    throw e;
  }

  await dispatchCompletionHooks({
    userId: attempt.userId,
    attemptId,
    offerId: attempt.offerId,
    offerKind: attempt.offer.kind,
    rewardKind: attempt.offer.rewardKind,
    now,
    event: "INTERNAL_OFFERWALL_ADMIN_APPROVED",
    approvedByAdmin: true,
  });

  log.info("internal_offerwall_attempt_admin_approved", {
    userId: attempt.userId,
    attemptId,
    offerId: attempt.offerId,
  });
  return { ok: true };
}

export async function adminRejectAttempt(attemptId: number, note?: string | null): Promise<AdminOperationResult> {
  const attempt = await repo.findPendingAttemptById(attemptId);
  if (!attempt) {
    return { ok: false, status: 404, message: "Pending attempt not found." };
  }
  await repo.markRejected(attemptId, note ? String(note).slice(0, 2000) : null);
  return { ok: true };
}
