/** One query for the visible photos of a list of users (ranking, leaderboards). */
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { resolveAvatarUrl } from "./avatar.rules.js";

const log = logger.child("AvatarLookup");

export async function loadAvatarUrls(userIds: number[], now = new Date()): Promise<Map<number, string>> {
  const ids = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
  const out = new Map<number, string>();
  if (ids.length === 0) return out;
  try {
    const rows = await prisma.userAvatar.findMany({
      where: { userId: { in: ids }, path: { not: null }, licenseExpiresAt: { gt: now }, uploadBlocked: false },
      select: { userId: true, path: true, licenseExpiresAt: true, uploadBlocked: true },
    });
    for (const r of rows) {
      const url = resolveAvatarUrl(r, now);
      if (url) out.set(r.userId, url);
    }
  } catch (err) {
    // A photo is cosmetic: a failed lookup shows initials, never breaks the ranking.
    log.warn("AVATAR_LOOKUP_FAILED", { count: ids.length, error: err instanceof Error ? err.message : String(err) });
  }
  return out;
}

export async function withAvatarUrls<T extends { id: number }>(rows: T[], now = new Date()): Promise<Array<T & { avatarUrl: string | null }>> {
  const urls = await loadAvatarUrls(rows.map((r) => r.id), now);
  return rows.map((r) => ({ ...r, avatarUrl: urls.get(r.id) ?? null }));
}

/** Leaderboard rows carry `userId` + `user: { id, username }`; adds `user.avatarUrl` (public fields only). */
export async function withLeaderboardAvatars<T extends { userId: number; user?: { id: number; username: string | null } | null }>(
  rows: T[],
  now = new Date(),
): Promise<T[]> {
  const urls = await loadAvatarUrls(rows.map((r) => r.userId), now);
  return rows.map((r) => (r.user ? { ...r, user: { id: r.user.id, username: r.user.username, avatarUrl: urls.get(r.userId) ?? null } } : r));
}
