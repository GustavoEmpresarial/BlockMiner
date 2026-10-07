/** Matches the server default. A shorter query is not sent. */
export const CHAT_USER_SEARCH_MIN_CHARS = 3;
export const CHAT_USER_SEARCH_DEBOUNCE_MS = 300;

export function readChatUserSearchDebounceMs(): number {
  const raw = import.meta.env.VITE_CHAT_USER_SEARCH_DEBOUNCE_MS as string | undefined;
  if (raw == null || raw.trim() === '') return CHAT_USER_SEARCH_DEBOUNCE_MS;
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed < 0) return CHAT_USER_SEARCH_DEBOUNCE_MS;
  return parsed;
}

export function chatUserSearchQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < CHAT_USER_SEARCH_MIN_CHARS) return null;
  return trimmed;
}

export function toChatUserHit(row: unknown): { id: number; username: string } | null {
  if (typeof row !== 'object' || row === null) return null;
  const id = (row as { id?: unknown }).id;
  const username = (row as { username?: unknown }).username;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) return null;
  if (typeof username !== 'string' || username.length === 0) return null;
  return { id, username };
}
