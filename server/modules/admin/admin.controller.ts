import type { Request, Response } from "express";
import { getRequestIp } from "../../shared/http/clientIp.js";
import {
  listAdmins,
  createAdmin,
  updateAdmin,
  changeAdminPassword,
  findAdminById,
  countSuperAdmins,
  listActiveAdminSessions,
  listAllActiveAdminSessions,
  revokeAdminSession,
  revokeAllSessionsForAdmin,
  revokeOtherSessionsForAdmin,
  toPublic,
  verifyAdminPassword,
  isStrongPassword,
} from "./admin.service.js";
import { queryAdminAuditLogs, getAdminAuditStats, logAdminAction, serializeAuditRow } from "./admin.audit-log.service.js";
import { ADMIN_ROLES } from "./admin.permissions.js";
import * as adminRepo from "./admin.repository.js";
import prisma from "../../core/database/prisma.js";


function getAdminCtx(req: Request) {
  return {
    adminId: req.admin?.adminId ?? null,
    adminEmail: req.admin?.email ?? null,
    sessionId: req.admin?.sessionId ?? null,
    ip: getRequestIp(req),
    ua: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
  };
}

export async function listAdminsHandler(_req: Request, res: Response): Promise<void> {
  const admins = await listAdmins();
  res.json({ ok: true, admins });
}

function isSuperAdmin(req: Request): boolean {
  return (
    req.admin?.role === "super_admin" ||
    (Array.isArray(req.admin?.permissions) && req.admin.permissions.includes("*"))
  );
}

export async function createAdminHandler(req: Request, res: Response): Promise<void> {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ ok: false, message: "Apenas Super Administradores podem gerenciar outros administradores." });
    return;
  }

  const ctx = getAdminCtx(req);
  const { name, email, password, role, permissions } = (req.body ?? {}) as Record<string, unknown>;

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
  if (role && !ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
    res.status(400).json({ ok: false, message: `Invalid role. Allowed: ${ADMIN_ROLES.join(", ")}` });
    return;
  }

  try {
    const admin = await createAdmin({
      name: String(name),
      email: String(email),
      password: String(password),
      role: (role as string) ?? "admin",
      permissions: Array.isArray(permissions) ? (permissions as string[]) : [],
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
  } catch (err: unknown) {
    if (String(err).includes("Unique constraint")) {
      res.status(409).json({ ok: false, message: "Email already in use." });
    } else {
      res.status(500).json({ ok: false, message: "Failed to create admin." });
    }
  }
}

export async function updateAdminHandler(req: Request, res: Response): Promise<void> {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ ok: false, message: "Apenas Super Administradores podem gerenciar outros administradores." });
    return;
  }

  const ctx = getAdminCtx(req);
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }

  const { name, role, permissions, isActive } = (req.body ?? {}) as Record<string, unknown>;

  if (role && !ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
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
    name: name as string | undefined,
    role: role as string | undefined,
    permissions: Array.isArray(permissions) ? (permissions as string[]) : undefined,
    isActive: isActive as boolean | undefined,
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

export async function resetAdminPasswordHandler(req: Request, res: Response): Promise<void> {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ ok: false, message: "Apenas Super Administradores podem gerenciar outros administradores." });
    return;
  }

  const ctx = getAdminCtx(req);
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }

  const { newPassword } = (req.body ?? {}) as Record<string, unknown>;
  if (!newPassword || !isStrongPassword(String(newPassword))) {
    res.status(400).json({ ok: false, message: "Password must be at least 12 chars with uppercase, lowercase, number and symbol." });
    return;
  }

  await changeAdminPassword(id, String(newPassword));
  await revokeAllSessionsForAdmin(id);
  await logAdminAction({ ...ctx, action: "ADMIN_PASSWORD_RESET", module: "admins", resource: "AdminUser", resourceId: String(id) });
  res.json({ ok: true });
}

export async function getAdminSessionsHandler(req: Request, res: Response): Promise<void> {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ ok: false, message: "Apenas Super Administradores podem ver sessões de outros administradores." });
    return;
  }

  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  const sessions = await listActiveAdminSessions(id);
  res.json({ ok: true, sessions });
}

export async function revokeAdminSessionsHandler(req: Request, res: Response): Promise<void> {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ ok: false, message: "Apenas Super Administradores podem revogar sessões de outros administradores." });
    return;
  }

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

export async function listMySessionsHandler(req: Request, res: Response): Promise<void> {
  const adminId = req.admin?.adminId;
  if (!adminId) {
    res.status(401).json({ ok: false, message: "Not authenticated" });
    return;
  }
  const sessions = await listActiveAdminSessions(adminId);
  res.json({ ok: true, sessions, currentSessionId: req.admin?.sessionId });
}

export async function listAllSessionsHandler(_req: Request, res: Response): Promise<void> {
  const sessions = await listAllActiveAdminSessions();
  res.json({ ok: true, sessions });
}

export async function revokeSessionHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAdminCtx(req);
  const sessionId = req.params.sessionId as string;
  await revokeAdminSession(sessionId);
  await logAdminAction({ ...ctx, action: "ADMIN_SESSION_REVOKE", module: "admins", resource: "AdminSession", resourceId: sessionId });
  res.json({ ok: true });
}

function parseSafeDate(raw: unknown): Date | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function adminAuditLogHandler(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
    const adminIdRaw = req.query.adminId ? Number(req.query.adminId) : undefined;
    const adminId = Number.isSafeInteger(adminIdRaw) && (adminIdRaw as number) > 0 ? (adminIdRaw as number) : undefined;
    const action = typeof req.query.action === "string" && req.query.action.trim() ? req.query.action.trim().slice(0, 50) : undefined;
    const moduleName = typeof req.query.module === "string" && req.query.module.trim() ? req.query.module.trim().slice(0, 50) : undefined;
    const search = typeof req.query.search === "string" && req.query.search.trim() ? req.query.search.trim().slice(0, 100) : undefined;
    const success = req.query.success === "true" ? true : req.query.success === "false" ? false : undefined;
    const from = parseSafeDate(req.query.from);
    const to = parseSafeDate(req.query.to);

    const result = await queryAdminAuditLogs({ adminId, action, module: moduleName, search, success, from, to, page, pageSize });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao buscar registros de auditoria" });
  }
}

export async function adminAuditStatsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const stats = await getAdminAuditStats();
    res.json({ ok: true, stats });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao carregar estatísticas de auditoria" });
  }
}

export async function getAdminProfileHandler(req: Request, res: Response): Promise<void> {
  const adminId = req.admin?.adminId;
  const currentSessionId = req.admin?.sessionId ?? null;

  if (adminId) {
    const adminRecord = await findAdminById(adminId);
    if (!adminRecord) {
      res.status(404).json({ ok: false, message: "Admin não encontrado" });
      return;
    }
    const [activeSessionsCount, totalAuditCount] = await Promise.all([
      prisma.adminSession.count({ where: { adminId, revokedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.adminAuditLog.count({ where: { adminId } }),
    ]);

    res.json({
      ok: true,
      admin: toPublic(adminRecord),
      activeSessionsCount,
      totalAuditCount,
      currentSessionId,
    });
    return;
  }

  // Fallback for legacy environment admin
  res.json({
    ok: true,
    admin: {
      id: 0,
      name: req.admin?.name || "Root Admin",
      email: req.admin?.email || "admin@blockminer.space",
      role: req.admin?.role || "super_admin",
      permissions: req.admin?.permissions || ["*"],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      lastLoginIp: getRequestIp(req),
      lastLoginUa: req.headers["user-agent"] || null,
    },
    activeSessionsCount: 1,
    totalAuditCount: 0,
    currentSessionId,
  });
}

export async function updateAdminProfileHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAdminCtx(req);
  const adminId = req.admin?.adminId;
  if (!adminId) {
    res.status(400).json({ ok: false, message: "Perfil não editável para administrador de sistema padrão." });
    return;
  }

  const { name } = (req.body ?? {}) as Record<string, unknown>;
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 60) {
    res.status(400).json({ ok: false, message: "O nome deve ter entre 2 e 60 caracteres." });
    return;
  }

  const adminRecord = await findAdminById(adminId);
  if (!adminRecord) {
    res.status(404).json({ ok: false, message: "Admin não encontrado." });
    return;
  }

  const updated = await updateAdmin(adminId, { name: trimmedName, updatedById: adminId });
  await logAdminAction({
    ...ctx,
    action: "ADMIN_PROFILE_UPDATE",
    module: "admins",
    resource: "AdminUser",
    resourceId: String(adminId),
    oldValue: { name: adminRecord.name },
    newValue: { name: updated.name },
  });

  res.json({ ok: true, admin: updated, message: "Perfil atualizado com sucesso." });
}

export async function revokeOtherSessionsHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAdminCtx(req);
  const adminId = req.admin?.adminId;
  const currentSessionId = req.admin?.sessionId;

  if (!adminId || !currentSessionId) {
    res.status(400).json({ ok: false, message: "Sessão não gerenciável para esta conta." });
    return;
  }

  const revokedCount = await revokeOtherSessionsForAdmin(adminId, currentSessionId);
  await logAdminAction({
    ...ctx,
    action: "ADMIN_SESSIONS_REVOKE_OTHER",
    module: "admins",
    resource: "AdminSession",
    resourceId: String(adminId),
    newValue: { revokedCount },
  });

  res.json({ ok: true, revokedCount, message: `${revokedCount} outras sessões foram encerradas.` });
}

export async function myAuditLogHandler(req: Request, res: Response): Promise<void> {
  const adminId = req.admin?.adminId;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 15));

  if (!adminId) {
    res.json({ ok: true, rows: [], total: 0, page: 1, pageSize, totalPages: 0 });
    return;
  }

  const result = await queryAdminAuditLogs({ adminId, page, pageSize });
  res.json({ ok: true, ...result });
}

export async function changeOwnPasswordHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAdminCtx(req);
  const adminId = req.admin?.adminId;
  if (!adminId) {
    res.status(401).json({ ok: false, message: "Not authenticated" });
    return;
  }

  const { currentPassword, newPassword } = (req.body ?? {}) as Record<string, unknown>;
  const adminRecord = await findAdminById(adminId);
  if (!adminRecord) {
    res.status(404).json({ ok: false, message: "Admin não encontrado." });
    return;
  }

  // Verify current password if provided
  if (currentPassword) {
    const passwordOk = await verifyAdminPassword(String(currentPassword), adminRecord.passwordHash);
    if (!passwordOk) {
      await logAdminAction({
        ...ctx,
        action: "ADMIN_CHANGE_PASSWORD_FAILED",
        module: "admins",
        resource: "AdminUser",
        resourceId: String(adminId),
        success: false,
        errorMsg: "WRONG_CURRENT_PASSWORD",
      });
      res.status(400).json({ ok: false, code: "INCORRECT_CURRENT_PASSWORD", message: "A senha atual informada está incorreta." });
      return;
    }
  }

  if (!newPassword || !isStrongPassword(String(newPassword))) {
    res.status(400).json({
      ok: false,
      code: "WEAK_PASSWORD",
      message: "A nova senha deve ter pelo menos 12 caracteres e conter maiúsculas, minúsculas, números e símbolos.",
    });
    return;
  }

  await changeAdminPassword(adminId, String(newPassword));
  const currentSessionId = req.admin?.sessionId;
  if (currentSessionId) {
    await revokeOtherSessionsForAdmin(adminId, currentSessionId);
  } else {
    await revokeAllSessionsForAdmin(adminId);
  }

  await logAdminAction({ ...ctx, action: "ADMIN_CHANGE_OWN_PASSWORD", module: "admins", resource: "AdminUser", resourceId: String(adminId) });
  res.json({ ok: true, message: "Senha alterada com sucesso. Todas as outras sessões foram encerradas." });
}

export async function adminOverviewHandler(_req: Request, res: Response): Promise<void> {
  const { totalAdmins, activeAdmins, activeSessions, recentLogs } = await adminRepo.getAdminOverviewAggregates();
  const serializedRecentLogs = recentLogs.map(serializeAuditRow);
  res.json({ ok: true, totalAdmins, activeAdmins, activeSessions, recentLogs: serializedRecentLogs });
}

