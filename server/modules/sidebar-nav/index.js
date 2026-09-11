/**
 * Public boundary of the sidebar-nav module. Other modules (auto-mining, checkin, faucet,
 * internal-offerwall, read-earn, shortlinks, support — and youtube once it exists) MUST import
 * `requireVisibleSidebarPath`/`sidebarRegistryPath` only from here, never from
 * sidebar-nav.gate.ts / sidebar-nav.service.ts directly.
 */
export { sidebarNavRouter } from "./sidebar-nav.routes.js";
export { sidebarNavAdminRouter } from "./sidebar-nav.admin.routes.js";
export { requireVisibleSidebarPath, sidebarRegistryPath } from "./sidebar-nav.gate.js";
export { isSidebarPathVisible } from "./sidebar-nav.service.js";
export { SIDEBAR_ITEM_REGISTRY } from "./sidebar-nav.registry.js";
export { SIDEBAR_NAV_ERROR } from "./sidebar-nav.errors.js";
