// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
export const SIDEBAR_NAV_ERROR = {
    LOAD_FAILED: "sidebar_nav_load_failed",
    SAVE_FAILED: "sidebar_nav_save_failed",
    FEATURE_DISABLED: "feature_disabled",
};

export type SidebarNavErrorCode = (typeof SIDEBAR_NAV_ERROR)[keyof typeof SIDEBAR_NAV_ERROR];
