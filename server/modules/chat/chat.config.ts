/** Product defaults for chat user search and the conversation scan window. */

export const CHAT_USER_SEARCH_MIN_CHARS = 3;
export const CHAT_USER_SEARCH_MAX_CHARS = 24;
export const CHAT_USER_SEARCH_RESULT_LIMIT = 20;
export const CHAT_USER_SEARCH_WINDOW_MS = 60_000;
export const CHAT_USER_SEARCH_MAX_PER_WINDOW = 20;
export const CHAT_CONVERSATION_SCAN_LIMIT = 100;

function readBoundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

export function readChatUserSearchMinChars(env: NodeJS.ProcessEnv = process.env): number {
  return readBoundedInt(env.CHAT_USER_SEARCH_MIN_CHARS, CHAT_USER_SEARCH_MIN_CHARS, 1, CHAT_USER_SEARCH_MAX_CHARS);
}

export function readChatUserSearchMaxChars(env: NodeJS.ProcessEnv = process.env): number {
  return readBoundedInt(env.CHAT_USER_SEARCH_MAX_CHARS, CHAT_USER_SEARCH_MAX_CHARS, 1, 64);
}

export function readChatUserSearchResultLimit(env: NodeJS.ProcessEnv = process.env): number {
  return readBoundedInt(env.CHAT_USER_SEARCH_RESULT_LIMIT, CHAT_USER_SEARCH_RESULT_LIMIT, 1, 50);
}

export function readChatUserSearchWindowMs(env: NodeJS.ProcessEnv = process.env): number {
  return readBoundedInt(env.CHAT_USER_SEARCH_WINDOW_MS, CHAT_USER_SEARCH_WINDOW_MS, 1_000, 600_000);
}

export function readChatUserSearchMaxPerWindow(env: NodeJS.ProcessEnv = process.env): number {
  return readBoundedInt(env.CHAT_USER_SEARCH_MAX_PER_WINDOW, CHAT_USER_SEARCH_MAX_PER_WINDOW, 1, 120);
}

export function readChatConversationScanLimit(env: NodeJS.ProcessEnv = process.env): number {
  return readBoundedInt(env.CHAT_CONVERSATION_SCAN_LIMIT, CHAT_CONVERSATION_SCAN_LIMIT, 1, 500);
}
