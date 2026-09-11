/**
 * Admin login (ex admin-auth module — merged into auth per plan decision:
 * "admin-auth não vira módulo próprio, funde em auth.admin.*"). Backed by
 * the admin module's identity services via its public index.ts.
 */
import crypto from "node:crypto";
import type { Request, Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { logger } from "../../core/logger/index.js";
import { getRequestIp } from "../../shared/http/clientIp.js";
import { getAdminTokenFromRequest, ADMIN_SESSION_COOKIE } from "../../shared/security/token.js";
import { appendSetCookie } from "../../shared/security/cookies.js";
import {
  findAdminByEmail,
  hasDbAdmins,
  createAdminSession,
  getActiveAdminSession,
  revokeAdminSession,
  updateLastLogin,
  verifyAdminPassword,
  logAdminAction,
  resolvePermissions,
} from "../admin/index.js";

const log = logger.child("AuthAdminController");

const LEGACY_ADMIN_EMAIL = String(process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const LEGACY_ADMIN_SECURITY_CODE = String(process.env.ADMIN_SECURITY_CODE ?? "").trim();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN ?? "24h";

function timingSafeStringEqual(a: unknown, b: unknown): boolean {
  const left = Buffer.from(String(a ?? ""), "utf8");
  const right = Buffer.from(String(b ?? ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function adminCookieShouldBeSecure(req: Request): boolean {
  const flag = String(process.env.ADMIN_SESSION_COOKIE_SECURE ?? "").trim().toLowerCase();
  if (flag === "false") return false;
  if (flag === "true") return true;
  const proto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0]!.trim().toLowerCase();
  return Boolean(req.secure || proto === "https");
}

function cookieMaxAgeSec(): number {
  const raw = String(process.env.ADMIN_JWT_EXPIRES_IN ?? "24h").trim().toLowerCase();
  const m = /^(\d+)(h|d|m)?$/.exec(raw);
  if (!m) return 86400;
  const n = parseInt(m[1]!, 10);
  if (m[2] === "d") return n * 86400;
  if (m[2] === "m") return n * 60;
  return n * 3600;
}

function buildAdminCookie(token: string, { secure }: { secure?: boolean } = {}): string {
  const maxAgeSec = cookieMaxAgeSec();
  const parts = [`${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAgeSec}`];
  const cookieDomain = String(process.env.ADMIN_SESSION_COOKIE_DOMAIN ?? process.env.COOKIE_DOMAIN ?? "").trim();
  if (cookieDomain) parts.push(`Domain=${cookieDomain}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function pickFirstNonEmpty(obj: unknown, keys: string[]): string {
  if (!obj || typeof obj !== "object") return "";
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export async function adminLoginPost(req: Request, res: Response): Promise<void> {
  const ip = getRequestIp(req);
  const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;

  try {
    if (!JWT_SECRET) {
      res.status(503).json({ ok: false, code: "ADMIN_AUTH_NOT_CONFIGURED", message: "JWT_SECRET missing." });
      return;
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const userEmailRaw = pickFirstNonEmpty(body, ["email", "Email", "adminEmail", "admin_email"]);
    const rawPassword = pickFirstNonEmpty(body, ["password", "securityCode", "code", "adminCode", "security_code", "admin_password"]);

    if (!userEmailRaw || !rawPassword) {
      res.status(400).json({ ok: false, message: "Email and password required" });
      return;
    }

    const email = userEmailRaw.toLowerCase();

    if (await hasDbAdmins()) {
      const adminRecord = await findAdminByEmail(email);
      if (!adminRecord || !adminRecord.isActive) {
        await logAdminAction({ adminEmail: email, action: "ADMIN_LOGIN_FAILURE", module: "auth", success: false, errorMsg: "INVALID_CREDENTIALS", ipAddress: ip, userAgent: ua });
        res.status(401).json({ ok: false, message: "Invalid credentials" });
        return;
      }

      const passwordOk = await verifyAdminPassword(rawPassword, adminRecord.passwordHash);
      if (!passwordOk) {
        await logAdminAction({ adminId: adminRecord.id, adminEmail: email, action: "ADMIN_LOGIN_FAILURE", module: "auth", success: false, errorMsg: "WRONG_PASSWORD", ipAddress: ip, userAgent: ua });
        res.status(401).json({ ok: false, message: "Invalid credentials" });
        return;
      }

      const session = await createAdminSession({ adminId: adminRecord.id, ip, ua });
      const permissions = resolvePermissions(adminRecord.role, adminRecord.permissions);

      const token = jwt.sign(
        { role: "admin", type: "admin_session", adminId: adminRecord.id, sessionId: session.id, adminRole: adminRecord.role, permissions },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN, issuer: "blockminer-admin" } as SignOptions,
      );

      await updateLastLogin(adminRecord.id, ip, ua);
      await logAdminAction({ adminId: adminRecord.id, adminEmail: email, sessionId: session.id, action: "ADMIN_LOGIN_SUCCESS", module: "auth", ipAddress: ip, userAgent: ua });

      appendSetCookie(res, buildAdminCookie(token, { secure: adminCookieShouldBeSecure(req) }));
      res.json({ ok: true, message: "Authenticated", adminId: adminRecord.id, role: adminRecord.role, name: adminRecord.name });
      return;
    }

    // Legacy env-var fallback (no AdminUser rows provisioned yet).
    if (!LEGACY_ADMIN_EMAIL || !LEGACY_ADMIN_SECURITY_CODE) {
      res.status(503).json({ ok: false, code: "ADMIN_AUTH_NOT_CONFIGURED", message: "Admin auth not configured." });
      return;
    }

    const emailMatch = timingSafeStringEqual(email, LEGACY_ADMIN_EMAIL);
    const codeMatch = timingSafeStringEqual(rawPassword, LEGACY_ADMIN_SECURITY_CODE);
    if (!emailMatch || !codeMatch) {
      res.status(401).json({ ok: false, message: "Invalid credentials" });
      return;
    }

    const token = jwt.sign({ role: "admin", type: "admin_session" }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, issuer: "blockminer-admin" } as SignOptions);
    appendSetCookie(res, buildAdminCookie(token, { secure: adminCookieShouldBeSecure(req) }));
    res.json({ ok: true, message: "Authenticated" });
  } catch (error: unknown) {
    log.error("Admin login error", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Internal server error" });
  }
}

export async function adminCheckGet(req: Request, res: Response): Promise<void> {
  try {
    if (!JWT_SECRET) {
      res.status(503).json({ ok: false, message: "JWT_SECRET missing." });
      return;
    }
    const token = getAdminTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ ok: false, code: "ADMIN_SESSION_INVALID", message: "Not authenticated" });
      return;
    }

    const payload = jwt.verify(token, JWT_SECRET, { issuer: "blockminer-admin", algorithms: ["HS256"] });
    if (typeof payload === "string" || !payload) {
      res.status(401).json({ ok: false, code: "ADMIN_SESSION_INVALID", message: "Not authenticated" });
      return;
    }

    const p = payload as Record<string, unknown>;
    if (p.role !== "admin" || p.type !== "admin_session") {
      res.status(403).json({ ok: false, message: "Forbidden" });
      return;
    }

    const sessionId = typeof p.sessionId === "string" ? p.sessionId : null;
    if (sessionId) {
      const session = await getActiveAdminSession(sessionId);
      if (!session) {
        res.status(401).json({ ok: false, code: "ADMIN_SESSION_INVALID", message: "Session expired or revoked" });
        return;
      }
    }

    const adminId = typeof p.adminId === "number" ? p.adminId : undefined;
    const role = typeof p.adminRole === "string" ? p.adminRole : "admin";
    res.json({ ok: true, adminId, role });
  } catch {
    res.status(401).json({ ok: false, code: "ADMIN_SESSION_INVALID", message: "Not authenticated" });
  }
}

export async function adminLogoutPost(req: Request, res: Response): Promise<void> {
  const ip = getRequestIp(req);
  const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;

  try {
    const token = getAdminTokenFromRequest(req);
    if (token && JWT_SECRET) {
      try {
        const payload = jwt.verify(token, JWT_SECRET, { issuer: "blockminer-admin", algorithms: ["HS256"] }) as Record<string, unknown>;
        const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : null;
        const adminId = typeof payload.adminId === "number" ? payload.adminId : null;
        if (sessionId) await revokeAdminSession(sessionId);
        if (adminId) {
          const email = typeof payload.email === "string" ? payload.email : null;
          await logAdminAction({ adminId, adminEmail: email, sessionId: sessionId ?? undefined, action: "ADMIN_LOGOUT", module: "auth", ipAddress: ip, userAgent: ua });
        }
      } catch {
        /* expired token — still clear cookie */
      }
    }
  } catch {
    /* ignore */
  }

  appendSetCookie(res, `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  res.json({ ok: true });
}
