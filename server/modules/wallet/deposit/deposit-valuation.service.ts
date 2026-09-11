/**
 * Resolves the immutable USD valuation of a deposit at confirmation time.
 * Must stay aligned with tournaments/deposit-score.js `countsForDepositTournament`.
 */
import { computeUsdValue, resolveAndPersistPrice } from "../../pricing/index.js";
import { resolveBlockTimestamp } from "../../../shared/blockchain/blockTimestamp.js";

/** All confirmed deposit sources count for deposit tournaments (incl. HD). */
export function countsForDepositTournament(_source: string | null | undefined): boolean {
  return true;
}

export async function valueDepositAtConfirmation(input: {
  blockNumber: number;
  polAmount: number;
  source: string;
}) {
  const confirmedEventAt = await resolveBlockTimestamp(input.blockNumber);
  const snapshot = await resolveAndPersistPrice("POL", confirmedEventAt);
  const usdRate = snapshot.priceUsd;
  const usdValue = computeUsdValue(input.polAmount, usdRate);
  return {
    confirmedEventAt,
    usdRate,
    usdValue,
    priceSnapshotId: snapshot.id,
    countsForTournament: countsForDepositTournament(input.source),
  };
}
