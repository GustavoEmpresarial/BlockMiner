import {
  readChatUserSearchMaxChars,
  readChatUserSearchMinChars,
  readChatUserSearchResultLimit,
} from "./chat.config.js";

export type ChatUserHit = { id: number; username: string };

/** Empty or too-short input must not become a directory of every user. */
export function normalizeChatUserSearchQuery(
  raw: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const min = readChatUserSearchMinChars(env);
  const max = readChatUserSearchMaxChars(env);
  if (trimmed.length < min) return null;
  return trimmed.slice(0, max);
}

export function buildChatUserSearchArgs(selfId: number, rawQuery: unknown, env: NodeJS.ProcessEnv = process.env) {
  const q = normalizeChatUserSearchQuery(rawQuery, env);
  if (q == null) return null;
  return {
    where: {
      isBanned: false,
      id: { not: selfId },
      username: { contains: q, mode: "insensitive" as const },
    },
    select: { id: true, username: true } as const,
    orderBy: { username: "asc" as const },
    take: readChatUserSearchResultLimit(env),
  };
}

export function toChatUserHit(row: { id: number; username: string | null }): ChatUserHit | null {
  if (typeof row.username !== "string" || row.username.length === 0) return null;
  return { id: row.id, username: row.username };
}
