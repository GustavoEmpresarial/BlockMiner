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

export function resolveApiPayloadMessage(
  data: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
  fallbackKey: string,
): string {
  if (data && typeof data === 'object') {
    const record = data as { message?: unknown; messageKey?: unknown; code?: unknown };
    if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
    if (typeof record.messageKey === 'string') {
      const translated = t(record.messageKey);
      if (translated !== record.messageKey) return translated;
    }
    if (typeof record.code === 'string') {
      const key = `errors.${record.code}`;
      const translated = t(key);
      if (translated !== key) return translated;
    }
  }
  return t(fallbackKey);
}
