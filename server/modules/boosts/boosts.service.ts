/**
 * Boosts (legacy "Power Boost") — reward-duration multiplier. Ported from
 * legacy/server/services/powerBoostService.ts.
 *
 * See README.md in this directory for the finding on whether this duplicates
 * mining/mining.engine.ts's applyBoost. Short version: it does not — this is a
 * daily entitlement (0.01 POL) that extends reward TTL from 24h to 7 days for
 * faucet/shortlinks/youtube/auto-mining grants; it does not touch mining rate,
 * rig speed, or any in-memory mining-engine multiplier.
 */
import { Prisma as PrismaNs } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import type { TxClient } from "../../core/database/prisma.js";
import * as boostsRepo from "./boosts.repository.js";
import type { ActivateResult, PowerBoostRewardSystem, PowerBoostStatus } from "./boosts.types.js";
import {
  balancesFromUser,
  buildTaxPayQuotes,
  convertPolFeeToCurrency,
  type TaxPayCurrency,
} from "../../shared/taxPaymentCurrency.js";

export const BOOST_COST_POL = 0.01;
export const NORMAL_TTL_MS = 24 * 60 * 60 * 1000;
export const BOOST_TTL_MS = 7 * NORMAL_TTL_MS;
export const NORMAL_DURATION_HOURS = 24;
export const BOOST_DURATION_HOURS = 168;

export function todayKeyUTC(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** When today's UTC entitlement ends (next UTC midnight). */
export function boostEntitlementExpiresAt(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
}

/** Single source of truth: reward TTL from earnedAt + durationMs (exact ms, no calendar drift). */
export function computeRewardExpiresAt(earnedAt: Date, durationMs: number): Date {
  return new Date(earnedAt.getTime() + durationMs);
}

export function rewardDurationHoursFromMs(durationMs: number): number {
  return durationMs / (60 * 60 * 1000);
}

export function formatRewardDurationPt(durationMs: number): string {
  const hours = rewardDurationHoursFromMs(durationMs);
  if (hours >= 24 && Number.isInteger(hours / 24)) {
    const days = hours / 24;
    return days === 1 ? "24 horas" : `${days} dias`;
  }
  return `${hours} horas`;
}

export async function hasActiveBoostTx(
  tx: Pick<TxClient, "dailyPowerBoost">,
  userId: number,
  dayKey = todayKeyUTC(),
): Promise<boolean> {
  const row = await tx.dailyPowerBoost.findUnique({
    where: { userId_dayKey: { userId, dayKey } },
    select: { id: true },
  });
  return row != null;
}

export async function hasActiveBoost(userId: number): Promise<boolean> {
  const row = await boostsRepo.findBoostForDay(userId, todayKeyUTC());
  return row != null;
}

/** Central reward-duration decision for all systems (faucet, shortlinks, YouTube, auto-mining). */
export async function getRewardDurationMs(userId: number, _rewardType?: PowerBoostRewardSystem): Promise<number> {
  return (await hasActiveBoost(userId)) ? BOOST_TTL_MS : NORMAL_TTL_MS;
}

/** Use inside Prisma transactions so TTL matches the same DB snapshot as the grant row. */
export async function getRewardDurationMsTx(
  tx: Pick<TxClient, "dailyPowerBoost">,
  userId: number,
  _rewardType?: PowerBoostRewardSystem,
): Promise<number> {
  return (await hasActiveBoostTx(tx, userId)) ? BOOST_TTL_MS : NORMAL_TTL_MS;
}

/** Immutable grant expiry: boost status for today's UTC day at creation time only. */
export async function resolveRewardExpiresAtForGrant(
  tx: Pick<TxClient, "dailyPowerBoost">,
  userId: number,
  earnedAt: Date,
  rewardType?: PowerBoostRewardSystem,
): Promise<{ expiresAt: Date; durationMs: number }> {
  const durationMs = await getRewardDurationMsTx(tx, userId, rewardType);
  return { expiresAt: computeRewardExpiresAt(earnedAt, durationMs), durationMs };
}

/** @deprecated Use getRewardDurationMs */
export const getBoostTtlMs = getRewardDurationMs;

export async function getPowerBoostStatus(userId: number): Promise<PowerBoostStatus> {
  const dayKey = todayKeyUTC();
  const active = await hasActiveBoost(userId);
  const user = await boostsRepo.findUserBalances(userId);
  const balances = balancesFromUser(user);
  const costQuotes = await buildTaxPayQuotes(BOOST_COST_POL, balances);
  return {
    active,
    dayKey,
    costPol: BOOST_COST_POL,
    costQuotes,
    balances,
    entitlementExpiresAt: active ? boostEntitlementExpiresAt().toISOString() : null,
    currentRewardDurationHours: active ? BOOST_DURATION_HOURS : NORMAL_DURATION_HOURS,
    normalRewardDurationHours: NORMAL_DURATION_HOURS,
    boostedRewardDurationHours: BOOST_DURATION_HOURS,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof PrismaNs.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function activateBoost(
  userId: number,
  currency: TaxPayCurrency = "POL",
): Promise<ActivateResult> {
  const dayKey = todayKeyUTC();
  const debitAmount = await convertPolFeeToCurrency(BOOST_COST_POL, currency);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await boostsRepo.findBoostForDayTx(tx, userId, dayKey);
      if (existing) {
        return { ok: false, code: "ALREADY_ACTIVE", message: "Power boost já ativo hoje." } as const;
      }

      const user = await boostsRepo.findUserTaxBalancesTx(tx, userId);
      const balances = balancesFromUser(user);
      if (balances[currency] < debitAmount) {
        return {
          ok: false,
          code: "INSUFFICIENT_BALANCE",
          message: `Saldo ${currency} insuficiente.`,
          currency,
        } as const;
      }

      const updated = await boostsRepo.decrementUserBalanceTx(tx, userId, currency, debitAmount);
      await boostsRepo.createBoostTx(tx, userId, dayKey, BOOST_COST_POL);
      const nextBalances = balancesFromUser(updated);
      await boostsRepo.createAuditLogTx(
        tx,
        userId,
        "power_boost_activated",
        JSON.stringify({
          dayKey,
          amountPol: BOOST_COST_POL,
          currency,
          feePaid: debitAmount,
          balanceAfter: nextBalances[currency],
          entitlementExpiresAt: boostEntitlementExpiresAt().toISOString(),
        }),
      );

      return {
        ok: true,
        dayKey,
        polBalance: nextBalances.POL,
        balances: nextBalances,
        currency,
        feePaid: debitAmount,
        entitlementExpiresAt: boostEntitlementExpiresAt().toISOString(),
      } as const;
    });
    // NOTE: legacy also called applyUserBalanceDelta(userId, -BOOST_COST_POL) here
    // to sync the in-memory mining engine — mining/ doesn't exist yet in current/.
    // See README.md.
    return result;
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, code: "ALREADY_ACTIVE", message: "Power boost já ativo hoje." } as const;
    }
    throw err;
  }
}
