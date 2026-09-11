export const ANTIBOT_ERROR = {
  INVALID_QUERY: "invalid_query",
  INVALID_STATUS: "invalid_status",
  INVALID_USER_ID: "invalid_user_id",
  USER_NOT_FOUND: "user_not_found",
} as const;

export type AntibotErrorCode = (typeof ANTIBOT_ERROR)[keyof typeof ANTIBOT_ERROR];
