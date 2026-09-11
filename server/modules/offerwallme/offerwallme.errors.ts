/** Ported from legacy/server/modules/offerwallme/offerwallme.controller.ts (inline error strings → named codes). */
export const OFFERWALLME_ERROR = {
  IP_REJECTED: "OFFERWALLME_IP_REJECTED",
  MISSING_PARAMS: "OFFERWALLME_MISSING_PARAMS",
  BAD_SIGNATURE: "OFFERWALLME_BAD_SIGNATURE",
  INVALID_USER: "OFFERWALLME_INVALID_USER",
  USER_NOT_FOUND: "OFFERWALLME_USER_NOT_FOUND",
  INTERNAL: "OFFERWALLME_INTERNAL_ERROR",
} as const;

export type OfferwallMeErrorCode = (typeof OFFERWALLME_ERROR)[keyof typeof OFFERWALLME_ERROR];
