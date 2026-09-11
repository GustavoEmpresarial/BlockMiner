export const IP_INTEL_ERROR = {
  INVALID_IP: "invalid_ip",
  PROVIDER_NOT_CONFIGURED: "provider_not_configured",
  PROVIDER_ERROR: "provider_error",
} as const;

export type IpIntelErrorCode = (typeof IP_INTEL_ERROR)[keyof typeof IP_INTEL_ERROR];
