export const SIDEBAR_NAV_ERROR = {
  LOAD_FAILED: "sidebar_nav_load_failed",
  SAVE_FAILED: "sidebar_nav_save_failed",
  FEATURE_DISABLED: "feature_disabled",
} as const;

export type SidebarNavErrorCode = (typeof SIDEBAR_NAV_ERROR)[keyof typeof SIDEBAR_NAV_ERROR];

