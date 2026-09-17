/**
 * Pure prize/ranking decisions for tournament finalization — no Prisma, no I/O,
 * so it is unit-testable without a database (same shape as tournament-window.ts).
 *
 * The rule this module exists to enforce: a prize row NEVER resolves to silence.
 * It is either a concrete grant or an explicit `invalid` carrying a stable error
 * code. The previous inline implementation in tournaments.service.ts fell through
 * every branch when an amount was null/0, returned without granting anything, and
 * left the entry flagged rewardGranted — permanently unpayable.
 */
import { TOURNAMENT_ERROR, type TournamentErrorCode } from "./tournaments.errors.js";

export type PrizeMiner = {
  id: number;
  name: string;
  imageUrl: string | null;
  baseHashRate: unknown;
  slotSize?: number | null;
};

/**
 * Amount fields are `unknown` on purpose: Prisma hands these over as Decimal in
 * some shapes and plain number in others, and the admin routes pass raw input.
 * Every read below goes through Number() anyway, so widening here keeps callers
 * from needing lossy casts.
 */
export type PrizeRow = {
  id?: number;
  rankFrom: number;
  rankTo: number;
  prizeType: string;
  polAmount?: unknown;
  blkAmount?: unknown;
  boostHashRate?: unknown;
  boostHours?: unknown;
  minerId?: unknown;
  minerCount?: unknown;
  miner?: PrizeMiner | null;
};

export type PrizeGrant =
  | { kind: "pol"; amount: number }
  | { kind: "blk"; amount: number }
  | { kind: "boost"; hashRate: number; hours: number }
  | {
      kind: "machine";
      minerId: number;
      minerName: string;
      minerImageUrl: string | null;
      slotSize: number;
      hashRate: number;
      quantity: number;
    }
  | { kind: "invalid"; code: TournamentErrorCode; reason: string };

/** Finite and strictly positive. Rejects null, undefined, 0, negatives, NaN, Infinity. */
function positive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Finite and non-negative — machines may legitimately carry 0 base hashrate. */
function nonNegative(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function invalid(code: TournamentErrorCode, reason: string): PrizeGrant {
  return { kind: "invalid", code, reason };
}

/**
 * Turns a prize row into the concrete grant to perform, or an explicit failure.
 * Total: every input maps to a defined outcome.
 */
export function resolvePrizeGrant(prize: PrizeRow): PrizeGrant {
  switch (prize.prizeType) {
    case "POL": {
      const amount = positive(prize.polAmount);
      if (amount === null) {
        return invalid(
          TOURNAMENT_ERROR.PRIZE_INVALID_AMOUNT,
          `POL prize needs a positive polAmount, got ${String(prize.polAmount)}`,
        );
      }
      return { kind: "pol", amount };
    }

    case "BLK": {
      const amount = positive(prize.blkAmount);
      if (amount === null) {
        return invalid(
          TOURNAMENT_ERROR.PRIZE_INVALID_AMOUNT,
          `BLK prize needs a positive blkAmount, got ${String(prize.blkAmount)}`,
        );
      }
      return { kind: "blk", amount };
    }

    case "MINING_BOOST": {
      const hashRate = positive(prize.boostHashRate);
      const hours = positive(prize.boostHours);
      if (hashRate === null || hours === null) {
        return invalid(
          TOURNAMENT_ERROR.PRIZE_INVALID_AMOUNT,
          `MINING_BOOST prize needs positive boostHashRate and boostHours, got ` +
            `${String(prize.boostHashRate)} / ${String(prize.boostHours)}`,
        );
      }
      return { kind: "boost", hashRate, hours };
    }

    case "MACHINE": {
      if (!prize.miner) {
        return invalid(
          TOURNAMENT_ERROR.PRIZE_MINER_MISSING,
          `MACHINE prize references minerId ${String(prize.minerId)} with no catalog row`,
        );
      }
      const hashRate = nonNegative(prize.miner.baseHashRate ?? 0);
      if (hashRate === null) {
        return invalid(
          TOURNAMENT_ERROR.PRIZE_INVALID_AMOUNT,
          `MACHINE prize miner ${prize.miner.id} has a non-numeric baseHashRate`,
        );
      }
      const rawQuantity = Number(prize.minerCount ?? 1);
      const quantity = Number.isFinite(rawQuantity) ? Math.max(1, Math.floor(rawQuantity)) : 1;
      return {
        kind: "machine",
        minerId: prize.miner.id,
        minerName: prize.miner.name,
        minerImageUrl: prize.miner.imageUrl ?? null,
        slotSize: prize.miner.slotSize ?? 1,
        hashRate,
        quantity,
      };
    }

    default:
      return invalid(
        TOURNAMENT_ERROR.PRIZE_UNSUPPORTED_TYPE,
        `unsupported prizeType ${JSON.stringify(prize.prizeType)}`,
      );
  }
}

/**
 * Validates a prize as submitted by the admin panel, before it is ever stored.
 *
 * Defence in depth for the same bug resolvePrizeGrant catches at payout time:
 * a prize row saved with a null/zero amount used to be unpayable forever, and
 * the admin routes happily wrote `?? null` for every optional field. Rejecting
 * it at write time means the payout path never meets it.
 *
 * MACHINE is only checked for a usable minerId here — whether that miner row
 * actually exists is a database question the caller answers.
 */
export function validatePrizeInput(
  prize: PrizeRow,
): { ok: true } | { ok: false; code: TournamentErrorCode; reason: string } {
  const rankFrom = Number(prize.rankFrom);
  const rankTo = Number(prize.rankTo);
  if (!Number.isInteger(rankFrom) || rankFrom < 1 || !Number.isInteger(rankTo) || rankTo < rankFrom) {
    return {
      ok: false,
      code: TOURNAMENT_ERROR.PRIZE_INVALID_AMOUNT,
      reason: `invalid rank band ${String(prize.rankFrom)}..${String(prize.rankTo)}`,
    };
  }

  if (prize.prizeType === "MACHINE") {
    const minerId = positive(prize.minerId);
    if (minerId === null) {
      return {
        ok: false,
        code: TOURNAMENT_ERROR.PRIZE_MINER_MISSING,
        reason: `MACHINE prize needs a minerId, got ${String(prize.minerId)}`,
      };
    }
    return { ok: true };
  }

  const resolved = resolvePrizeGrant(prize);
  if (resolved.kind === "invalid") {
    return { ok: false, code: resolved.code, reason: resolved.reason };
  }
  return { ok: true };
}

/** The prize band covering `rank`, or undefined. Bands are inclusive on both ends. */
export function findPrizeForRank<T extends { rankFrom: number; rankTo: number }>(
  prizes: readonly T[],
  rank: number,
): T | undefined {
  return prizes.find((p) => rank >= p.rankFrom && rank <= p.rankTo);
}

/**
 * Highest rank that can win anything. Finalization only needs to run the grant
 * path for entries up to this rank — that is what keeps the prize loop bounded
 * instead of walking every entry in the tournament.
 */
export function maxPrizeRank(prizes: readonly { rankTo: number }[]): number {
  let max = 0;
  for (const p of prizes) {
    const rankTo = Number(p.rankTo);
    if (Number.isFinite(rankTo) && rankTo > max) max = rankTo;
  }
  return max;
}

export type RankableEntry = {
  id: number;
  userId: number;
  /** Coerced with Number() before comparison — may arrive as a Decimal. */
  score: unknown;
  firstContributionAt?: Date | null;
};

/**
 * Orders entries and assigns 1-based ranks: score desc, then earliest
 * firstContributionAt (whoever got there first wins the tie), then id asc so the
 * result is fully deterministic even when both are equal. Entries that never
 * contributed sort last among their score group.
 */
export function assignRanks<T extends RankableEntry>(entries: readonly T[]): Array<T & { rank: number }> {
  return [...entries]
    .sort((a, b) => {
      const as = Number(a.score) || 0;
      const bs = Number(b.score) || 0;
      if (bs !== as) return bs - as;
      const at = a.firstContributionAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const bt = b.firstContributionAt?.getTime() ?? Number.POSITIVE_INFINITY;
      if (at !== bt) return at - bt;
      return a.id - b.id;
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}
