/** Public surface of the admin module — the only import path other modules may use. */
export { adminRouter } from "./admin.routes.js";
export { requireAdminAuth, invalidateAdminAuthCache, verifyAdminJwtToken } from "./admin.auth.middleware.js";
export {
  findAdminByEmail,
  findAdminById,
  hasDbAdmins,
  createAdminSession,
  getActiveAdminSession,
  revokeAdminSession,
  updateLastLogin,
  verifyAdminPassword,
} from "./admin.service.js";
export { logAdminAction } from "./admin.audit-log.service.js";
export { resolvePermissions, hasPermission, ADMIN_ROLES } from "./admin.permissions.js";
export { bootstrapAdminUsers } from "./admin.bootstrap.js";
