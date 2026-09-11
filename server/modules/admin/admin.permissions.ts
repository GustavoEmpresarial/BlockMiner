// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
export const ADMIN_ROLES = ["super_admin", "admin", "moderator", "finance", "support", "readonly"];
export const ROLE_DEFAULT_PERMISSIONS = {
    super_admin: ["*"],
    admin: [
        "dashboard", "users", "miners", "inventory", "store", "payments",
        "withdrawals", "deposits", "support", "logs", "monitoring", "promotions",
        "events", "offerwall", "ptc", "shortlinks", "checkin", "mining",
        "tournaments", "banners", "config", "audit", "admins",
    ],
    moderator: ["dashboard", "users.view", "users.ban", "support", "logs.view"],
    finance: ["dashboard", "users.view", "payments", "withdrawals", "deposits"],
    support: ["dashboard", "users.view", "support"],
    readonly: ["dashboard"],
};
export function resolvePermissions(role, permissionsOverride) {
    const defaults = ROLE_DEFAULT_PERMISSIONS[role] ?? ["dashboard"];
    if (!Array.isArray(permissionsOverride) || permissionsOverride.length === 0)
        return defaults;
    return permissionsOverride.filter((p) => typeof p === "string");
}
export function hasPermission(permissions, required) {
    if (permissions.includes("*"))
        return true;
    if (permissions.includes(required))
        return true;
    const moduleName = required.split(".")[0];
    return permissions.includes(moduleName);
}
