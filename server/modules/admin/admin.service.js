/**
 * Admin identity services: admin-user CRUD, admin password hashing,
 * admin sessions. Merged from legacy adminUser.service.ts +
 * adminPassword.service.ts + adminSession.service.ts (admin-system module —
 * see plan decision "admin-system → admin").
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import prisma from "../../core/database/prisma.js";
import { resolvePermissions } from "./admin.permissions.js";
// ---------------------------------------------------------------------------
// Password hashing (admin-specific cost factor — higher than player bcrypt)
// ---------------------------------------------------------------------------
const ADMIN_PASSWORD_COST = 12;
export async function hashAdminPassword(plain) {
    return bcrypt.hash(plain, ADMIN_PASSWORD_COST);
}
export async function verifyAdminPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}
export function isStrongPassword(password) {
    return (password.length >= 12 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /[0-9]/.test(password) &&
        /[^A-Za-z0-9]/.test(password));
}
function toPublic(u) {
    const { passwordHash: _ph, ...rest } = u;
    return { ...rest, permissions: resolvePermissions(u.role, u.permissions) };
}
export async function findAdminByEmail(email) {
    return prisma.adminUser.findUnique({ where: { email: email.toLowerCase().trim() } });
}
export async function findAdminById(id) {
    return prisma.adminUser.findUnique({ where: { id } });
}
export async function listAdmins() {
    const admins = await prisma.adminUser.findMany({ orderBy: { createdAt: "asc" } });
    return admins.map(toPublic);
}
export async function createAdmin(data) {
    const passwordHash = await hashAdminPassword(data.password);
    const admin = await prisma.adminUser.create({
        data: {
            name: data.name.trim(),
            email: data.email.toLowerCase().trim(),
            passwordHash,
            role: data.role ?? "admin",
            permissions: data.permissions ?? [],
            createdById: data.createdById ?? null,
            updatedById: data.createdById ?? null,
        },
    });
    return toPublic(admin);
}
export async function updateAdmin(id, data) {
    const admin = await prisma.adminUser.update({
        where: { id },
        data: {
            ...(data.name != null ? { name: data.name.trim() } : {}),
            ...(data.role != null ? { role: data.role } : {}),
            ...(data.permissions != null ? { permissions: data.permissions } : {}),
            ...(data.isActive != null ? { isActive: data.isActive } : {}),
            updatedById: data.updatedById ?? null,
        },
    });
    return toPublic(admin);
}
export async function changeAdminPassword(id, newPassword) {
    const passwordHash = await hashAdminPassword(newPassword);
    await prisma.adminUser.update({ where: { id }, data: { passwordHash } });
}
export async function updateLastLogin(id, ip, ua) {
    await prisma.adminUser.update({ where: { id }, data: { lastLoginAt: new Date(), lastLoginIp: ip, lastLoginUa: ua } });
}
export async function countSuperAdmins() {
    return prisma.adminUser.count({ where: { role: "super_admin", isActive: true } });
}
export async function hasDbAdmins() {
    const count = await prisma.adminUser.count({ where: { isActive: true } }).catch(() => 0);
    return count > 0;
}
// ---------------------------------------------------------------------------
// Admin sessions
// ---------------------------------------------------------------------------
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
function parseExpiresIn(raw) {
    const s = String(raw ?? "").trim().toLowerCase();
    if (!s)
        return SESSION_TTL_MS;
    const match = /^(\d+)(h|d|m)?$/.exec(s);
    if (!match)
        return SESSION_TTL_MS;
    const n = parseInt(match[1], 10);
    switch (match[2]) {
        case "d": return n * 86400000;
        case "m": return n * 60000;
        default: return n * 3600000;
    }
}
export function generateSessionId() {
    return randomBytes(24).toString("hex");
}
export async function createAdminSession(opts) {
    const ttl = parseExpiresIn(process.env.ADMIN_JWT_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + ttl);
    const id = generateSessionId();
    return prisma.adminSession.create({ data: { id, adminId: opts.adminId, ipAddress: opts.ip, userAgent: opts.ua, expiresAt } });
}
export async function getActiveAdminSession(sessionId) {
    const session = await prisma.adminSession.findUnique({ where: { id: sessionId } });
    if (!session)
        return null;
    if (session.revokedAt != null)
        return null;
    if (session.expiresAt < new Date())
        return null;
    return session;
}
export async function touchAdminSession(sessionId) {
    await prisma.adminSession
        .updateMany({ where: { id: sessionId, revokedAt: null }, data: { lastActivityAt: new Date() } })
        .catch(() => undefined);
}
export async function revokeAdminSession(sessionId) {
    await prisma.adminSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}
export async function revokeAllSessionsForAdmin(adminId) {
    const result = await prisma.adminSession.updateMany({ where: { adminId, revokedAt: null }, data: { revokedAt: new Date() } });
    return result.count;
}
export async function listActiveAdminSessions(adminId) {
    return prisma.adminSession.findMany({
        where: { adminId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastActivityAt: "desc" },
    });
}
export async function listAllActiveAdminSessions() {
    return prisma.adminSession.findMany({
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        include: { admin: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { lastActivityAt: "desc" },
    });
}
