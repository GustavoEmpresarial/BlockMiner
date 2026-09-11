/** Ported from legacy/server/modules/shortlinks (application/shortlinks.service.ts + repository). */
export const TOTAL_STEPS = 3;
export const MAX_DAILY_RUNS = 1;
export const REWARD_HASH_RATE = 50.0;
/** Legacy anti-fraud floor: minimum time a real user needs between two steps. */
export const MIN_STEP_INTERVAL_MS = 8_000;
/** ZerAds AN-Script external shortlink (linkapi.php). */
export const PASTEAD_PROVIDER = "zerads";
/** AdLinkFly external shortlink (same reward/cap as ZerAds pastead). */
export const ADLINKFLY_PROVIDER = "adlinkfly";
export const PASTEAD_REWARD_HS = Number(process.env.PASTEAD_REWARD_HS ?? "20") || 20;
export const PASTEAD_DAILY_HS_CAP = Number(process.env.PASTEAD_DAILY_HS_CAP ?? "1000") || 1000;
/** Floor after external success redirect — must still wait a bit before claim (anti-bot). */
export const PASTEAD_MIN_ELAPSED_MS = Number(process.env.PASTEAD_MIN_ELAPSED_MS ?? "15000") || 15_000;
export const PASTEAD_SESSION_TTL_MS = Number(process.env.PASTEAD_SESSION_TTL_MS ?? "1800000") || 1_800_000;
export const PASTEAD_MAX_DAILY_RUNS = Math.max(1, Math.floor(PASTEAD_DAILY_HS_CAP / PASTEAD_REWARD_HS));

export type ShortlinkSecurityFlags = {
  webdriver?: boolean;
  headlessHints?: boolean;
  [key: string]: unknown;
};

export type CompleteStepAuditContext = {
  ip: string | null;
  userAgent: string | null;
};

export type StartShortlinkOutcome =
  | { ok: true; nextStep: number; sessionToken: string }
  | { ok: false; reason: "daily_limit" | "server_error" };

export type CompleteStepOutcome =
  | { ok: true; completed: true; rewardMessage: string; hashRate: number }
  | { ok: true; completed: false; nextStep: number; sessionToken: string }
  | {
      ok: false;
      reason: "no_session" | "daily_limit" | "detected" | "invalid_step" | "too_fast" | "server_error";
    };

export type PasteadStatusPayload = {
  enabled: boolean;
  shortlinkName: string;
  rewardName: string;
  rewardHs: number;
  dailyHsEarned: number;
  dailyHsCap: number;
  dailyRuns: number;
  maxDailyRuns: number;
  available: boolean;
  pending: boolean;
  pendingToken: string | null;
  doneReached: boolean;
  claimReadyAt: string | null;
  /** Present for providers that can sit in maintenance while credentials exist. */
  maintenance?: boolean;
};

export type StartPasteadOutcome =
  | { ok: true; token: string; externalUrl: string }
  | { ok: false; reason: "disabled" | "daily_limit" | "api_error" | "server_error" };

export type MarkPasteadDoneOutcome =
  | { ok: true; token: string; claimReadyAt: string }
  | { ok: false; reason: "disabled" | "no_session" | "expired" };

export type ClaimPasteadOutcome =
  | { ok: true; rewardMessage: string; hashRate: number }
  | {
      ok: false;
      reason: "disabled" | "no_session" | "not_completed" | "too_fast" | "expired" | "daily_limit";
    };
