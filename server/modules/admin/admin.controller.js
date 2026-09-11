import { getRequestIp } from "../../shared/http/clientIp.js";
import { listAdmins, createAdmin, updateAdmin, changeAdminPassword, findAdminById, countSuperAdmins, listActiveAdminSessions, listAllActiveAdminSessions, revokeAdminSession, revokeAllSessionsForAdmin, isStrongPassword, } from "./admin.service.js";
import { queryAdminAuditLogs, logAdminAction, serializeAuditRow } from "./admin.audit-log.service.js";
import { ADMIN_ROLES } from "./admin.permissions.js";
import * as adminRepo from "./admin.repository.js";
function getAdminCtx(req) {
    return {
        adminId: req.admin?.adminId ?? null,
        adminEmail: req.admin?.email ?? null,
        sessionId: req.admin?.sessionId ?? null,
        ip: getRequestIp(req),
        ua: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
    };
}
export async function listAdminsHandler(_req, res) {
    const admins = await listAdmins();
    res.json({ ok: true, admins });
}
export async function createAdminHandler(req, res) {
    const ctx = getAdminCtx(req);
    const { name, email, password, role, permissions } = (req.body ?? {});
    if (!name || !email || !password) {
        res.status(400).json({ ok: false, message: "name, email and password are required" });
        return;
    }
    if (!isStrongPassword(String(password))) {
        res.status(400).json({
            ok: false,
            message: "Password must be at least 12 characters and include uppercase, lowercase, number and symbol.",
        });
        return;
    }
    if (role && !ADMIN_ROLES.includes(role)) {
        res.status(400).json({ ok: false, message: `Invalid role. Allowed: ${ADMIN_ROLES.join(", ")}` });
        return;
    }
    try {
        const admin = await createAdmin({
            name: String(name),
            email: String(email),
            password: String(password),
            role: role ?? "admin",
            permissions: Array.isArray(permissions) ? permissions : [],
            createdById: ctx.adminId ?? undefined,
        });
        await logAdminAction({
            ...ctx,
            action: "ADMIN_CREATE",
            module: "admins",
            resource: "AdminUser",
            resourceId: String(admin.id),
            newValue: { name: admin.name, email: admin.email, role: admin.role },
        });
        res.status(201).json({ ok: true, admin });
    }
    catch (err) {
        if (String(err).includes("Unique constraint")) {
            res.status(409).json({ ok: false, message: "Email already in use." });
        }
        else {
            res.status(500).json({ ok: false, message: "Failed to create admin." });
        }
    }
}
export async function updateAdminHandler(req, res) {
    const ctx = getAdminCtx(req);
    const id = Number(req.params.id);
    if (!id) {
        res.status(400).json({ ok: false, message: "Invalid id" });
        return;
    }
    const { name, role, permissions, isActive } = (req.body ?? {});
    if (role && !ADMIN_ROLES.includes(role)) {
        res.status(400).json({ ok: false, message: "Invalid role" });
        return;
    }
    if (role && role !== "super_admin") {
        const target = await findAdminById(id);
        if (target?.role === "super_admin") {
            const count = await countSuperAdmins();
            if (count <= 1) {
                res.status(400).json({ ok: false, message: "Cannot demote the last super_admin." });
                return;
            }
        }
    }
    if (isActive === false) {
        const target = await findAdminById(id);
        if (target?.role === "super_admin") {
            const count = await countSuperAdmins();
            if (count <= 1) {
                res.status(400).json({ ok: false, message: "Cannot deactivate the last super_admin." });
                return;
            }
        }
    }
    const before = await findAdminById(id);
    const admin = await updateAdmin(id, {
        name: name,
        role: role,
        permissions: Array.isArray(permissions) ? permissions : undefined,
        isActive: isActive,
        updatedById: ctx.adminId ?? undefined,
    });
    if (isActive === false) {
        await revokeAllSessionsForAdmin(id);
    }
    await logAdminAction({
        ...ctx,
        action: "ADMIN_UPDATE",
        module: "admins",
        resource: "AdminUser",
        resourceId: String(id),
        oldValue: before ? { name: before.name, role: before.role, isActive: before.isActive } : undefined,
        newValue: { name: admin.name, role: admin.role, isActive: admin.isActive },
    });
    res.json({ ok: true, admin });
}
export async function resetAdminPasswordHandler(req, res) {
    const ctx = getAdminCtx(req);
    const id = Number(req.params.id);
    if (!id) {
        res.status(400).json({ ok: false, message: "Invalid id" });
        return;
    }
    const { newPassword } = (req.body ?? {});
    if (!newPassword || !isStrongPassword(String(newPassword))) {
        res.status(400).json({ ok: false, message: "Password must be at least 12 chars with uppercase, lowercase, number and symbol." });
        return;
    }
    await changeAdminPassword(id, String(newPassword));
    await revokeAllSessionsForAdmin(id);
    await logAdminAction({ ...ctx, action: "ADMIN_PASSWORD_RESET", module: "admins", resource: "AdminUser", resourceId: String(id) });
    res.json({ ok: true });
}
export async function getAdminSessionsHandler(req, res) {
    const id = Number(req.params.id);
    if (!id) {
        res.status(400).json({ ok: false, message: "Invalid id" });
        return;
    }
    const sessions = await listActiveAdminSessions(id);
    res.json({ ok: true, sessions });
}
export async function revokeAdminSessionsHandler(req, res) {
    const ctx = getAdminCtx(req);
    const id = Number(req.params.id);
    if (!id) {
        res.status(400).json({ ok: false, message: "Invalid id" });
        return;
    }
    const count = await revokeAllSessionsForAdmin(id);
    await logAdminAction({ ...ctx, action: "ADMIN_SESSIONS_REVOKE_ALL", module: "admins", resource: "AdminUser", resourceId: String(id), newValue: { revokedCount: count } });
    res.json({ ok: true, revokedCount: count });
}
export async function listMySessionsHandler(req, res) {
    const adminId = req.admin?.adminId;
    if (!adminId) {
        res.status(401).json({ ok: false, message: "Not authenticated" });
        return;
    }
    const sessions = await listActiveAdminSessions(adminId);
    res.json({ ok: true, sessions, currentSessionId: req.admin?.sessionId });
}
export async function listAllSessionsHandler(_req, res) {
    const sessions = await listAllActiveAdminSessions();
    res.json({ ok: true, sessions });
}
export async function revokeSessionHandler(req, res) {
    const ctx = getAdminCtx(req);
    const sessionId = req.params.sessionId;
    await revokeAdminSession(sessionId);
    await logAdminAction({ ...ctx, action: "ADMIN_SESSION_REVOKE", module: "admins", resource: "AdminSession", resourceId: sessionId });
    res.json({ ok: true });
}
export async function adminAuditLogHandler(req, res) {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const adminId = req.query.adminId ? Number(req.query.adminId) : undefined;
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const moduleName = typeof req.query.module === "string" ? req.query.module : undefined;
    const success = req.query.success === "true" ? true : req.query.success === "false" ? false : undefined;
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const result = await queryAdminAuditLogs({ adminId, action, module: moduleName, success, from, to, page, pageSize });
    res.json({ ok: true, ...result });
}
export async function changeOwnPasswordHandler(req, res) {
    const ctx = getAdminCtx(req);
    const adminId = req.admin?.adminId;
    if (!adminId) {
        res.status(401).json({ ok: false, message: "Not authenticated" });
        return;
    }
    const { newPassword } = (req.body ?? {});
    if (!newPassword || !isStrongPassword(String(newPassword))) {
        res.status(400).json({ ok: false, message: "Password must be at least 12 chars with uppercase, lowercase, number and symbol." });
        return;
    }
    await changeAdminPassword(adminId, String(newPassword));
    const currentSessionId = req.admin?.sessionId;
    const sessions = await listActiveAdminSessions(adminId);
    for (const s of sessions) {
        if (s.id !== currentSessionId)
            await revokeAdminSession(s.id);
    }
    await logAdminAction({ ...ctx, action: "ADMIN_CHANGE_OWN_PASSWORD", module: "admins", resource: "AdminUser", resourceId: String(adminId) });
    res.json({ ok: true });
}
export async function adminOverviewHandler(_req, res) {
    const { totalAdmins, activeAdmins, activeSessions, recentLogs } = await adminRepo.getAdminOverviewAggregates();
    const serializedRecentLogs = recentLogs.map(serializeAuditRow);
    res.json({ ok: true, totalAdmins, activeAdmins, activeSessions, recentLogs: serializedRecentLogs });
}
