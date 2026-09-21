/**
 * Admin identity services: admin-user CRUD, admin password hashing,
 * admin sessions. Merged from legacy adminUser.service.ts +
 * adminPassword.service.ts + adminSession.service.ts (admin-system module —
 * see plan decision "admin-system → admin").
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { AdminSession, AdminUser } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { resolvePermissions } from "./admin.permissions.js";

// ---------------------------------------------------------------------------
// Password hashing (admin-specific cost factor — higher than player bcrypt)
// ---------------------------------------------------------------------------

const ADMIN_PASSWORD_COST = 12;

export async function hashAdminPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ADMIN_PASSWORD_COST);
}

export async function verifyAdminPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

// ---------------------------------------------------------------------------
// Admin users
// ---------------------------------------------------------------------------

export type AdminUserPublic = Omit<AdminUser, "passwordHash"> & {
  permissions: string[];
  activeSessionsCount?: number;
  auditCount?: number;
};

export function toPublic(u: AdminUser): AdminUserPublic {
  const { passwordHash: _ph, ...rest } = u;
  return { ...rest, permissions: resolvePermissions(u.role, u.permissions) };
}

export async function findAdminByEmail(email: string): Promise<AdminUser | null> {
  return prisma.adminUser.findUnique({ where: { email: email.toLowerCase().trim() } });
}

export async function findAdminById(id: number): Promise<AdminUser | null> {
  return prisma.adminUser.findUnique({ where: { id } });
}

export async function listAdmins(): Promise<AdminUserPublic[]> {
  const admins = await prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: {
        select: {
          sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } },
          auditLogs: true,
        },
      },
    },
  });
  return admins.map((u) => ({
    ...toPublic(u),
    activeSessionsCount: u._count?.sessions ?? 0,
    auditCount: u._count?.auditLogs ?? 0,
  }));
}

export async function createAdmin(data: {
  name: string;
  email: string;
  password: string;
  role?: string;
  permissions?: string[];
  createdById?: number;
}): Promise<AdminUserPublic> {
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

export async function updateAdmin(
  id: number,
  data: { name?: string; role?: string; permissions?: string[]; isActive?: boolean; updatedById?: number },
): Promise<AdminUserPublic> {
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

export async function changeAdminPassword(id: number, newPassword: string): Promise<void> {
  const passwordHash = await hashAdminPassword(newPassword);
  await prisma.adminUser.update({ where: { id }, data: { passwordHash } });
}

export async function updateLastLogin(id: number, ip: string | null, ua: string | null): Promise<void> {
  await prisma.adminUser.update({ where: { id }, data: { lastLoginAt: new Date(), lastLoginIp: ip, lastLoginUa: ua } });
}

export async function countSuperAdmins(): Promise<number> {
  return prisma.adminUser.count({ where: { role: "super_admin", isActive: true } });
}

export async function hasDbAdmins(): Promise<boolean> {
  const count = await prisma.adminUser.count({ where: { isActive: true } }).catch(() => 0);
  return count > 0;
}

// ---------------------------------------------------------------------------
// Admin sessions
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function parseExpiresIn(raw: string | undefined): number {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return SESSION_TTL_MS;
  const match = /^(\d+)(h|d|m)?$/.exec(s);
  if (!match) return SESSION_TTL_MS;
  const n = parseInt(match[1]!, 10);
  switch (match[2]) {
    case "d": return n * 86400000;
    case "m": return n * 60000;
    default: return n * 3600000;
  }
}

export function generateSessionId(): string {
  return randomBytes(24).toString("hex");
}

export async function createAdminSession(opts: { adminId: number; ip: string | null; ua: string | null }): Promise<AdminSession> {
  const ttl = parseExpiresIn(process.env.ADMIN_JWT_EXPIRES_IN);
  const expiresAt = new Date(Date.now() + ttl);
  const id = generateSessionId();
  return prisma.adminSession.create({ data: { id, adminId: opts.adminId, ipAddress: opts.ip, userAgent: opts.ua, expiresAt } });
}

export async function findAdminSessionById(sessionId: string): Promise<AdminSession | null> {
  return prisma.adminSession.findUnique({ where: { id: sessionId } });
}

export async function getActiveAdminSession(sessionId: string): Promise<AdminSession | null> {
  const session = await prisma.adminSession.findUnique({ where: { id: sessionId } });
  if (!session) return null;
  if (session.revokedAt != null) return null;
  if (session.expiresAt < new Date()) return null;
  return session;
}

export async function touchAdminSession(sessionId: string): Promise<void> {
  await prisma.adminSession
    .updateMany({ where: { id: sessionId, revokedAt: null }, data: { lastActivityAt: new Date() } })
    .catch(() => undefined);
}

export async function revokeAdminSession(sessionId: string): Promise<void> {
  await prisma.adminSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllSessionsForAdmin(adminId: number): Promise<number> {
  const result = await prisma.adminSession.updateMany({ where: { adminId, revokedAt: null }, data: { revokedAt: new Date() } });
  return result.count;
}

export async function revokeOtherSessionsForAdmin(adminId: number, currentSessionId: string): Promise<number> {
  const result = await prisma.adminSession.updateMany({
    where: { adminId, id: { not: currentSessionId }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}


export async function listActiveAdminSessions(adminId: number) {
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
