/** `status` column of partner offerwall callback tables (offerwallme / offerwallgg / multiwall). */
export const OFFERWALL_CALLBACK_STATUS = {
  CREDIT: 1,
  CHARGEBACK: 2,
} as const;

/**
 * Outcome of a partner chargeback against the callback ledger.
 * - `reversed`: the credit row flipped to CHARGEBACK; BLK debited, part reversed.
 * - `already_reversed`: replay of a chargeback already applied — no-op.
 * - `recorded_without_credit`: chargeback arrived before/without any credit — audit row only.
 * - `user_mismatch`: transId belongs to a different user — nothing changed.
 */
export type OfferwallReversalOutcome =
  | { kind: "reversed"; creditedAt: Date }
  | { kind: "already_reversed" }
  | { kind: "recorded_without_credit" }
  | { kind: "user_mismatch"; ownerUserId: number };

export function isPrismaUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}
