/**
 * Auth-user lookup cache + ban enforcement — genuinely cross-module infra
 * (core auth middleware, session, users and admin all need it), so it lives
 * in shared/, not inside any single owning module. Ported from
 * legacy/server/models/userModel.ts (getUserById slice) + utils/banEnforcement.ts.
 */
import type { Prisma, User } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import type { AuthSessionUser } from "../types/express.js";

const AUTH_USER_TTL_MS = Math.max(1_000, Number(process.env.AUTH_USER_CACHE_TTL_MS ?? 10_000) || 10_000);

type CacheEntry = { at: number; user: AuthSessionUser | null };
const authUserCache = new Map<number, CacheEntry>();

export function invalidateAuthUserCache(userId: number): void {
  authUserCache.delete(userId);
}

export async function getAuthUserById(userId: number): Promise<AuthSessionUser | null> {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const now = Date.now();
  const hit = authUserCache.get(id);
  if (hit && now - hit.at < AUTH_USER_TTL_MS) return hit.user;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      isBanned: true,
      polBalance: true,
      usdcBalance: true,
      sessionVersion: true,
      emailVerifiedAt: true, // item 95 Parte B — requireEmailVerified.
    },
  });

  authUserCache.set(id, { at: now, user: user as AuthSessionUser | null });
  if (authUserCache.size > 20_000) {
    const firstKey = authUserCache.keys().next().value;
    if (firstKey != null) authUserCache.delete(firstKey);
  }
  return user as AuthSessionUser | null;
}

export async function updateUserLoginMeta(
  userId: number,
  { ip, userAgent }: { ip?: string | null; userAgent?: string | null },
): Promise<User> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date(), ip: ip || null, userAgent: userAgent || null },
  });
  invalidateAuthUserCache(userId);
  return updated;
}

export interface BanStatus {
  banned: boolean;
  reason: string | null;
  until: Date | null;
  permanent: boolean;
}

const NOT_BANNED: BanStatus = { banned: false, reason: null, until: null, permanent: false };

export async function checkBanOrExpire(userId: number): Promise<BanStatus> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { isBanned: true, banReason: true, bannedUntil: true },
  });
  if (!row || !row.isBanned) return NOT_BANNED;

  if (row.bannedUntil && row.bannedUntil.getTime() <= Date.now()) {
    await prisma.user
      .update({
        where: { id: userId },
        data: { isBanned: false, banReason: null, bannedAt: null, bannedUntil: null, bannedByAdminId: null },
      })
      .catch(() => undefined);
    invalidateAuthUserCache(userId);
    return NOT_BANNED;
  }

  return {
    banned: true,
    reason: row.banReason ?? null,
    until: row.bannedUntil ?? null,
    permanent: row.bannedUntil == null,
  };
}

export function bannedResponseBody(ban: BanStatus): Record<string, unknown> {
  return {
    ok: false,
    code: "ACCOUNT_DISABLED",
    message: ban.permanent ? "Sua conta foi suspensa permanentemente." : "Sua conta está temporariamente suspensa.",
    banReason: ban.reason,
    bannedUntil: ban.until ? ban.until.toISOString() : null,
    permanent: ban.permanent,
  };
}

export type { Prisma };
