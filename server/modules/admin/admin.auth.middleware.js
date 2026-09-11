import jwt from "jsonwebtoken";
import { getAdminTokenFromRequest } from "../../shared/security/token.js";
import { logger } from "../../core/logger/index.js";
import { getActiveAdminSession, touchAdminSession, findAdminById } from "./admin.service.js";
import { resolvePermissions } from "./admin.permissions.js";
const log = logger.child("AdminAuthMiddleware");
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
const ADMIN_AUTH_CACHE_TTL_MS = Math.max(1_000, Number(process.env.ADMIN_AUTH_CACHE_TTL_MS ?? 8_000) || 8_000);
const adminAuthCache = new Map();
export function invalidateAdminAuthCache(sessionId) {
    if (!sessionId) {
        adminAuthCache.clear();
        return;
    }
    adminAuthCache.delete(sessionId);
}
export async function requireAdminAuth(req, res, next) {
    try {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            log.error("Admin JWT secret is missing");
            res.status(503).json({ ok: false, message: "Admin auth unavailable." });
            return;
        }
        const token = getAdminTokenFromRequest(req);
        if (!token) {
            res.status(401).json({ ok: false, code: "ADMIN_SESSION_INVALID", message: "Admin session invalid." });
            return;
        }
        let payload = null;
        try {
            payload = jwt.verify(token, jwtSecret, { issuer: "blockminer-admin", algorithms: ["HS256"] });
        }
        catch {
            res.status(401).json({ ok: false, code: "ADMIN_SESSION_INVALID", message: "Admin session invalid." });
            return;
        }
        if (typeof payload === "string" || !isRecord(payload)) {
            res.status(401).json({ ok: false, code: "ADMIN_SESSION_INVALID", message: "Admin session invalid." });
            return;
        }
        if (payload["role"] !== "admin" || payload["type"] !== "admin_session") {
            res.status(403).json({ ok: false, message: "Forbidden" });
            return;
        }
        const sessionId = typeof payload["sessionId"] === "string" ? payload["sessionId"] : undefined;
        const adminId = typeof payload["adminId"] === "number" ? payload["adminId"] : undefined;
        if (sessionId && adminId) {
            const now = Date.now();
            const cached = adminAuthCache.get(sessionId);
            if (cached && now - cached.at < ADMIN_AUTH_CACHE_TTL_MS && cached.admin.adminId === adminId) {
                req.admin = cached.admin;
                void touchAdminSession(sessionId);
                next();
                return;
            }
            const session = await getActiveAdminSession(sessionId);
            if (!session) {
                adminAuthCache.delete(sessionId);
                res.status(401).json({ ok: false, code: "ADMIN_SESSION_INVALID", message: "Session expired or revoked." });
                return;
            }
            const adminRecord = await findAdminById(adminId);
            if (!adminRecord || !adminRecord.isActive) {
                adminAuthCache.delete(sessionId);
                res.status(401).json({ ok: false, code: "ADMIN_SESSION_INVALID", message: "Admin account inactive." });
                return;
            }
            const permissions = resolvePermissions(adminRecord.role, adminRecord.permissions);
            req.admin = { role: adminRecord.role, adminId, sessionId, email: adminRecord.email, name: adminRecord.name, permissions };
            adminAuthCache.set(sessionId, { at: now, admin: req.admin });
            if (adminAuthCache.size > 2_000) {
                const first = adminAuthCache.keys().next().value;
                if (first != null)
                    adminAuthCache.delete(first);
            }
            void touchAdminSession(sessionId);
        }
        else {
            // Legacy env-var session (no DB-backed AdminUser row).
            req.admin = { role: "admin", permissions: ["*"] };
        }
        next();
    }
    catch (error) {
        log.error("Admin auth middleware error", { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ ok: false, message: "Unable to authenticate." });
    }
}
export function verifyAdminJwtToken(token) {
    try {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret || !token)
            return null;
        const payload = jwt.verify(String(token).trim(), jwtSecret, { issuer: "blockminer-admin", algorithms: ["HS256"] });
        if (typeof payload === "string" || !isRecord(payload))
            return null;
        if (payload["role"] !== "admin" || payload["type"] !== "admin_session")
            return null;
        return payload;
    }
    catch {
        return null;
    }
}
