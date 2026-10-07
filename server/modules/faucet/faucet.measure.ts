export const FAUCET_PARTNER_VISIT_SOURCE = {
  CLICK: "click",
  BLUR: "blur",
  UNKNOWN: "unknown",
} as const;

export type FaucetPartnerVisitSource =
  (typeof FAUCET_PARTNER_VISIT_SOURCE)[keyof typeof FAUCET_PARTNER_VISIT_SOURCE];

export const FAUCET_CLAIM_MEASURED = "faucet.claim.measured";
export const FAUCET_CLAIM_MEASURE_FAILED = "faucet.claim.measure_failed";

/** Missing or unexpected values stay unknown so an old client keeps working. */
export function normalizeFaucetPartnerVisitSource(raw: unknown): FaucetPartnerVisitSource {
  if (raw === FAUCET_PARTNER_VISIT_SOURCE.CLICK || raw === FAUCET_PARTNER_VISIT_SOURCE.BLUR) return raw;
  return FAUCET_PARTNER_VISIT_SOURCE.UNKNOWN;
}

export type FaucetClaimMeasurement = {
  userId: number;
  msSinceVisitOpened: number | null;
  msSinceEligible: number | null;
  source: FaucetPartnerVisitSource;
  userAgent: string | null;
  ipHash: string | null;
  correlationId: string | null;
};

export function buildFaucetClaimMeasurement(input: {
  userId: number;
  now: Date;
  openedAt: Date | null;
  eligibleAt: Date | null;
  source: string | null;
  userAgent: string | null;
  ipHash: string | null;
  correlationId: string | null;
}): FaucetClaimMeasurement {
  const nowMs = input.now.getTime();
  return {
    userId: input.userId,
    msSinceVisitOpened: input.openedAt == null ? null : nowMs - input.openedAt.getTime(),
    msSinceEligible: input.eligibleAt == null ? null : nowMs - input.eligibleAt.getTime(),
    source: normalizeFaucetPartnerVisitSource(input.source),
    userAgent: input.userAgent,
    ipHash: input.ipHash,
    correlationId: input.correlationId,
  };
}

type MeasureSink = {
  info: (message: string, details: Record<string, unknown>) => void;
  warn: (message: string, details: Record<string, unknown>) => void;
};

/** Never throws. A failed measurement must not undo a claim that already committed. */
export function emitFaucetClaimMeasurement(sink: MeasureSink, details: FaucetClaimMeasurement): void {
  try {
    sink.info(FAUCET_CLAIM_MEASURED, details);
  } catch (error: unknown) {
    try {
      sink.warn(FAUCET_CLAIM_MEASURE_FAILED, { userId: details.userId, error: String(error) });
    } catch {
      // The reward is already granted.
    }
  }
}
