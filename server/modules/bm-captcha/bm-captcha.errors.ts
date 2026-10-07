/** Stable report codes for the BM captcha. The HTTP body keeps code "INTERNAL". */
export const BM_CAPTCHA_ERROR = {
  CHALLENGE_FAILED: "BM_CAPTCHA_CHALLENGE_FAILED",
  VERIFY_FAILED: "BM_CAPTCHA_VERIFY_FAILED",
} as const;

export type BmCaptchaErrorCode = (typeof BM_CAPTCHA_ERROR)[keyof typeof BM_CAPTCHA_ERROR];
