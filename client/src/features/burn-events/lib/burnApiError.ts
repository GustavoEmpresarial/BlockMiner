import { isAxiosError } from 'axios';
import { resolveApiErrorMessage } from '../../../shared/utils/apiErrorI18n';

export function resolveBurnApiError(
  error: unknown,
  t: (key: string, opts?: Record<string, unknown>) => string,
  fallback: string,
): string {
  if (isAxiosError(error)) {
    const data = error.response?.data;
    if (data && typeof data === 'object') {
      const code = (data as { code?: unknown }).code;
      if (typeof code === 'string' && code.trim()) {
        const key = `burnEvents.errors.${code}`;
        const translated = t(key);
        if (translated !== key) return translated;
      }
    }
  }
  return resolveApiErrorMessage(error, fallback);
}
