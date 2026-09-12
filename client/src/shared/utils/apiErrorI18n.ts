import { isAxiosError } from 'axios';

/** Prefer server `message`, then axios message, then fallback (admin toasts). */
export function resolveApiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === 'object' && data !== null) {
      const msg = (data as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
    }
    if (typeof error.message === 'string' && error.message.trim()) return error.message.trim();
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

/**
 * Prefer the server's own `message`, optionally resolving `messageKey`/`code`
 * through `t` when given, then fall back to an already-resolved string.
 *
 * `fallback` takes a resolved string (e.g. `t('common.error')`), matching every
 * real call site in this codebase — none of them pass a translate function or a
 * translation key here. The signature used to require `(data, t, fallbackKey)`,
 * which no caller actually followed; every one of them called it as
 * `resolveApiPayloadMessage(data, t('some.key'))`, passing an already-translated
 * string as the (missing) `t` parameter. That made this function throw
 * `TypeError: t is not a function` the moment a server payload carried a
 * `messageKey` field — i.e. exactly the error-reporting path most likely to run
 * right after a real failure. Fixed 2026-09-12 to match the real, live contract;
 * `t` is now optional and only used for the messageKey/code lookup.
 */
export function resolveApiPayloadMessage(
  data: unknown,
  fallback: string,
  t?: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (data && typeof data === 'object') {
    const record = data as { message?: unknown; messageKey?: unknown; code?: unknown };
    if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
    if (t && typeof record.messageKey === 'string') {
      const translated = t(record.messageKey);
      if (translated !== record.messageKey) return translated;
    }
    if (t && typeof record.code === 'string') {
      const key = `errors.${record.code}`;
      const translated = t(key);
      if (translated !== key) return translated;
    }
  }
  return fallback;
}
