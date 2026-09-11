import prisma from "../../core/database/prisma.js";
const AUTH_USER_TTL_MS = Math.max(1_000, Number(process.env.AUTH_USER_CACHE_TTL_MS ?? 10_000) || 10_000);
const authUserCache = new Map();
export function invalidateAuthUserCache(userId) {
    authUserCache.delete(userId);
}
export async function getAuthUserById(userId) {
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0)
        return null;
    const now = Date.now();
    const hit = authUserCache.get(id);
    if (hit && now - hit.at < AUTH_USER_TTL_MS)
        return hit.user;
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
    authUserCache.set(id, { at: now, user: user });
    if (authUserCache.size > 20_000) {
        const firstKey = authUserCache.keys().next().value;
        if (firstKey != null)
            authUserCache.delete(firstKey);
    }
    return user;
}
export async function updateUserLoginMeta(userId, { ip, userAgent }) {
    const updated = await prisma.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date(), ip: ip || null, userAgent: userAgent || null },
    });
    invalidateAuthUserCache(userId);
    return updated;
}
const NOT_BANNED = { banned: false, reason: null, until: null, permanent: false };
export async function checkBanOrExpire(userId) {
    const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { isBanned: true, banReason: true, bannedUntil: true },
    });
    if (!row || !row.isBanned)
        return NOT_BANNED;
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
export function bannedResponseBody(ban) {
    return {
        ok: false,
        code: "ACCOUNT_DISABLED",
        message: ban.permanent ? "Sua conta foi suspensa permanentemente." : "Sua conta está temporariamente suspensa.",
        banReason: ban.reason,
        bannedUntil: ban.until ? ban.until.toISOString() : null,
        permanent: ban.permanent,
    };
}
