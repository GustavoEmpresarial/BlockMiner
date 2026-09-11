import { isAxiosError } from 'axios';
import { isAxiosTimeoutError } from '../utils/apiTimeout';

const GATEWAY_BUSY_MESSAGE =
  'O servidor está temporariamente indisponível. Não é problema com sua senha — tente entrar novamente em alguns segundos.';
const NETWORK_ERROR_MESSAGE = 'Falha de conexão com o servidor. Verifique sua internet e tente novamente.';

/**
 * Maps Axios / API auth errors to a safe user-visible string. A 5xx / network
 * error must never be reported as "invalid credentials" — ported verbatim
 * from legacy/client/src/pages/auth/shared/auth.errors.ts.
 */
export function readAuthErrorMessage(
  error: unknown,
  fallback = 'Não foi possível entrar. Verifique os dados e tente novamente.',
): string {
  if (isAxiosTimeoutError(error)) {
    return 'O servidor demorou para responder. Aguarde alguns segundos e tente entrar novamente.';
  }
  if (isAxiosError(error) && !error.response) {
    return NETWORK_ERROR_MESSAGE;
  }
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: unknown; status?: number } }).response;
    const status = response?.status;
    const data = response?.data;

    if (typeof status === 'number' && (status === 502 || status === 503 || status === 504)) {
      return GATEWAY_BUSY_MESSAGE;
    }
    if (typeof data === 'object' && data !== null) {
      const d = data as Record<string, unknown>;
      const errors = d.errors;
      if (Array.isArray(errors) && errors.length > 0) {
        const first = errors[0];
        if (typeof first === 'object' && first !== null && 'message' in first) {
          const m = (first as { message?: unknown }).message;
          if (typeof m === 'string' && m.trim()) return m.trim();
        }
      }
      if ('message' in d && typeof d.message === 'string' && d.message.trim()) return d.message.trim();
    }
    if (status === 429) return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
    if (typeof status === 'number' && status >= 500) return GATEWAY_BUSY_MESSAGE;
    if (status === 401) return 'Credenciais inválidas ou sessão expirada.';
  }
  return fallback;
}
