/** Error/status codes used across the partner-games controller + service. */
export const PARTNER_GAMES_ERROR = {
  PARTNER_GAME_NOT_FOUND: "PARTNER_GAME_NOT_FOUND",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  SESSION_ENDED: "SESSION_ENDED",
} as const;

export type PartnerGamesErrorCode = (typeof PARTNER_GAMES_ERROR)[keyof typeof PARTNER_GAMES_ERROR];
