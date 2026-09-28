/** Ported from legacy/server/modules/internal-offerwall/domain/internal-offerwall.types.ts. */
import type { Prisma } from "@prisma/client";

export type ParseAdminOfferBodySuccess = {
  ok: true;
  data: Prisma.InternalOfferwallOfferUncheckedCreateInput;
};

export type ParseAdminOfferBodyError = {
  ok: false;
  status: number;
  message: string;
  code?: string;
  details?: { host: string };
};

export type ParseAdminOfferBodyResult = ParseAdminOfferBodySuccess | ParseAdminOfferBodyError;

export type ValidateIframeUrlResult =
  | { ok: true; url: string }
  | { ok: false; code: string; message: string; host?: string };

export type ValidateFrameHostnameResult =
  | { ok: true; hostname: string }
  | { ok: false; message: string };

export type NormalizeTaskMetadataResult =
  | { ok: true; value: Record<string, unknown> | null }
  | { ok: false; message: string; code?: string; host?: string };

export type OfferLimitConfig = {
  resetType: string;
  maxPerPeriod: number;
  cooldownWindowSec: number | null;
};

export type CompletionRow = { periodKey: string; completedAt: Date | null };

export type UsageSnapshot = {
  completedCount: number;
  maxPerPeriod: number;
  resetType: string;
  cooldownWindowSec: number | null;
  secondsUntilAvailable: number | null;
  canStartNew: boolean;
};

export type UserListOffersResult =
  | {
      ok: true;
      dailyReset: {
        timezone: string;
        localDate: string;
        nextResetAt: string;
        nextResetInMs: number;
      };
      offers: Record<string, unknown>[];
      openAttempts: Record<string, unknown>[];
    }
  | {
      ok: false;
      code: string;
      offers: Record<string, unknown>[];
      openAttempts: Record<string, unknown>[];
    };

export type UserStartOfferResult =
  | { ok: true; attempt: { id: number; offerId: number; status: string; startedAt: string; partnerOpenedAt: string | null } }
  | { ok: false; status: number; code: string; message: string; secondsUntilReset?: number };

export type UserMarkPartnerOpenedResult =
  | { ok: true; partnerOpenedAt: string }
  | { ok: false; status: number; code: string; message: string };

export type UserAbandonAttemptResult =
  | { ok: true; alreadyCleared: boolean; deleted: boolean }
  | { ok: false; status: number; code: string; message: string };

export type UserSubmitAttemptResult =
  | { ok: true; status: string; message: string }
  | { ok: false; status: number; code: string; message: string };

export type AdminOperationResult =
  | { ok: true }
  | { ok: false; status: number; message: string };
