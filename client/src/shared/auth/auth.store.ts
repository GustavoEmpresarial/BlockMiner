import { create } from 'zustand';
import axios, { isAxiosError, type AxiosError, type AxiosResponse } from 'axios';
import { API_TIMEOUT_MS_AUTH, API_TIMEOUT_MS_SESSION, resolveApiTimeoutMs } from '../utils/apiTimeout';
import { readAuthErrorMessage } from './auth.errors';
import { generateSecurityPayload } from '../utils/security';
import { captureCsrfFromPayload, resolveCsrfTokenForRequest } from './csrfMemory';

/** Public session user (matches current/server auth JSON; no secrets). */
export type AuthUser = {
  id: number;
  name: string;
  username: string | null;
  email: string;
  /** Optimistic flag for energy-tax dashboard gating (optional; not always from session). */
  energyHasPendingTax?: boolean;
  /** item 95 Parte B — false só pra contas criadas após o deploy da verificação de email. */
  emailVerified?: boolean;
  /** item 97 — código de indicação público (vai na URL compartilhada, não é segredo). */
  refCode?: string | null;
};

export interface RegisterPayload {
  username?: string;
  email?: string;
  password?: string;
  refCode?: string;
  acceptTerms?: boolean;
  cfTurnstileToken?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrerDomain?: string;
}

export interface RegisterFailureResult {
  success: false;
  message: string;
  code?: string;
  fieldPath?: string;
  fieldMessage?: string;
}
export interface RegisterSuccessResult {
  success: true;
}
export type RegisterResult = RegisterSuccessResult | RegisterFailureResult;

export interface LoginResultSuccess {
  success: true;
}
export interface LoginResultFailure {
  success: false;
  message?: string;
}
export type LoginResult = LoginResultSuccess | LoginResultFailure;

export interface CheckSessionOptions {
  silent?: boolean;
}

function parseAuthUserPayload(raw: unknown): AuthUser | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'number') return null;
  if (typeof o.name !== 'string') return null;
  if (typeof o.email !== 'string') return null;
  const un = o.username;
  if (un !== null && typeof un !== 'string') return null;
  return { id: o.id, name: o.name, email: o.email, username: un ?? null };
}

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authHydrated: boolean;
  error: string | null;

  checkSession: (opts?: CheckSessionOptions) => Promise<void>;
  login: (identifier: string, password: string) => Promise<LoginResult>;
  register: (data: RegisterPayload) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  setUser: (patch: Partial<AuthUser>) => void;
}

function readAxiosResponseMessage(response: AxiosResponse<unknown> | undefined, fallback = ''): string {
  const data = response?.data;
  if (typeof data !== 'object' || data === null) return fallback;
  const d = data as Record<string, unknown>;
  if (typeof d.message === 'string' && d.message.trim()) return d.message.trim();
  return fallback;
}

function readRegisterFirstError(
  response: AxiosResponse<unknown> | undefined,
): { path?: string; message?: string; code?: string } | null {
  const data = response?.data;
  if (typeof data !== 'object' || data === null) return null;
  const errors = (data as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0];
  if (typeof first !== 'object' || first === null) return null;
  const path = (first as { path?: unknown }).path;
  const message = (first as { message?: unknown }).message;
  const code = (data as { code?: unknown }).code;
  return {
    path: typeof path === 'string' ? path : undefined,
    message: typeof message === 'string' ? message : undefined,
    code: typeof code === 'string' ? code : undefined,
  };
}

// axios instance targeting current/server's /api/auth/* JSON contract.
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  // Must match current/server/core/http/middleware/csrf.ts: cookie name
  // "blockminer_csrf", header "x-csrf-token" — axios reads the cookie and
  // echoes it in the header automatically for state-changing requests.
  xsrfCookieName: 'blockminer_csrf',
  xsrfHeaderName: 'x-csrf-token',
  timeout: resolveApiTimeoutMs(import.meta.env.VITE_API_TIMEOUT_MS as string | undefined),
});

api.interceptors.request.use((config) => {
  const csrf = resolveCsrfTokenForRequest();
  if (csrf) {
    const headers = config.headers;
    if (headers && typeof headers.set === 'function') {
      headers.set('x-csrf-token', csrf);
    } else {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>)['x-csrf-token'] = csrf;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    captureCsrfFromPayload(response.data);
    return response;
  },
  (error) => {
    if (isAxiosError(error)) captureCsrfFromPayload(error.response?.data);
    return Promise.reject(error);
  },
);

/**
 * Routes guarded by `requireCriticalIdempotency` on the server reject POSTs without a valid
 * Idempotency-Key (8–128 chars, [0-9a-zA-Z._-]) with:
 *   { code: "INVALID_STATE", message: "The resource is not in a valid state for this action." }
 * Ported from legacy/client/src/store/auth.ts — without this interceptor every install/buy/
 * rack/wallet mutation surfaces that exact toast.
 */
const IDEMPOTENCY_PATH_MARKERS = [
  '/vault/',
  '/inventory/install',
  '/inventory/remove',
  '/machines/toggle',
  '/machines/remove',
  '/machines/move',
  '/shop/purchase',
  '/shop/purchase-fan',
  '/shop/purchase-rack',
  '/offer-events/purchase',
  '/offer-events/purchase-fan',
  '/offer-events/purchase-rack',
  '/rooms/rack/install',
  '/rooms/rack/uninstall',
  '/rooms/rack/uninstall-batch',
  '/wallet/deposit',
  '/wallet/deposit/submit',
  '/wallet/withdraw',
  '/wallet/blk/convert',
  '/internal-offerwall/',
  '/energy-tax/pay-daily',
];

api.interceptors.request.use(
  (config) => {
    try {
      const security = generateSecurityPayload();
      config.headers['X-Anti-Bot-Payload'] = security.fingerprint;
      config.headers['X-Anti-Bot-Key'] = security.sk;
      config.headers['X-Anti-Bot'] = security.isBot ? '1' : '0';
    } catch {
      config.headers['X-Anti-Bot'] = '0';
    }
    const method = String(config.method || 'get').toLowerCase();
    if (method === 'post' || method === 'put' || method === 'patch') {
      const url = String(config.url || '');
      const needsKey = IDEMPOTENCY_PATH_MARKERS.some((m) => url.includes(m));
      const headers = config.headers;
      const hasKey =
        Boolean(headers?.['Idempotency-Key'] || headers?.['idempotency-key']) ||
        (typeof headers?.get === 'function' &&
          Boolean(headers.get('Idempotency-Key') || headers.get('idempotency-key')));
      if (needsKey && !hasKey) {
        const k =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        if (headers && typeof headers.set === 'function') {
          headers.set('Idempotency-Key', k);
        } else {
          config.headers = config.headers ?? {};
          (config.headers as Record<string, string>)['Idempotency-Key'] = k;
        }
      }
    }
    return config;
  },
  (error: unknown) => Promise.reject(error),
);

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await api.post('/auth/refresh', {}, { timeout: API_TIMEOUT_MS_SESSION });
      const rawUser = res.data && typeof res.data === 'object' ? (res.data as { user?: unknown }).user : null;
      const u = parseAuthUserPayload(rawUser);
      if (!u) return false;
      useAuthStore.setState({ user: u, isAuthenticated: true, error: null });
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!isAxiosError(error)) return Promise.reject(error);
    const status = error.response?.status;
    const url = String(error.config?.url || '');
    const isAuthRoute =
      url.startsWith('/auth/login') ||
      url.startsWith('/auth/register') ||
      url.startsWith('/auth/refresh') ||
      url.startsWith('/auth/session');
    const originalConfig = error.config;
    if (status === 401 && !isAuthRoute && originalConfig && !(originalConfig as { _bmRetried?: boolean })._bmRetried) {
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        (originalConfig as { _bmRetried?: boolean })._bmRetried = true;
        return api.request(originalConfig);
      }
      useAuthStore.setState({ user: null, isAuthenticated: false });
    }
    return Promise.reject(error);
  },
);

let sessionCheckPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  authHydrated: false,
  error: null,

  setUser: (patch: Partial<AuthUser>) => {
    set((state) => (!state.user ? { user: { ...patch } as AuthUser } : { user: { ...state.user, ...patch } }));
  },

  checkSession: async (opts?: CheckSessionOptions) => {
    const silent = Boolean(opts?.silent);
    if (sessionCheckPromise) return sessionCheckPromise;
    const run = async () => {
      try {
        if (!silent) set({ isLoading: true, error: null });
        let response = await api.get('/auth/session', { timeout: API_TIMEOUT_MS_SESSION });
        let rawUser =
          response.data && typeof response.data === 'object' ? (response.data as { user?: unknown }).user : null;
        let u = parseAuthUserPayload(rawUser);
        if (!u) {
          const refreshed = await tryRefreshSession();
          if (refreshed) {
            response = await api.get('/auth/session', { timeout: API_TIMEOUT_MS_SESSION });
            rawUser =
              response.data && typeof response.data === 'object' ? (response.data as { user?: unknown }).user : null;
            u = parseAuthUserPayload(rawUser);
          }
        }
        set({ user: u, isAuthenticated: Boolean(u), isLoading: false });
      } catch (error: unknown) {
        const axiosError = isAxiosError(error) ? error : null;
        const status = axiosError?.response?.status;
        if (status === 401) {
          set({ user: null, isAuthenticated: false, isLoading: false, error: null });
        } else {
          const message =
            status && status >= 500
              ? readAxiosResponseMessage(
                  axiosError?.response,
                  'Não foi possível verificar sua sessão agora. Tente novamente.',
                )
              : null;
          set({ user: null, isAuthenticated: false, isLoading: false, error: message });
        }
      } finally {
        sessionCheckPromise = null;
        set({ authHydrated: true });
      }
    };
    sessionCheckPromise = run();
    return sessionCheckPromise;
  },

  login: async (identifier: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      const response = await api.post('/auth/login', { identifier, password }, { timeout: API_TIMEOUT_MS_AUTH });
      const rawUser =
        response.data && typeof response.data === 'object' ? (response.data as { user?: unknown }).user : null;
      const user = parseAuthUserPayload(rawUser);
      set({ user, isAuthenticated: Boolean(user), isLoading: false });
      return { success: true as const };
    } catch (error: unknown) {
      const fallback = 'Não foi possível entrar. Verifique os dados e tente novamente.';
      const message = isAxiosError(error) ? readAuthErrorMessage(error, fallback) : fallback;
      set({ error: message, isLoading: false });
      return {
        success: false as const,
        message: isAxiosError(error) ? readAuthErrorMessage(error) || undefined : undefined,
      };
    }
  },

  register: async (data: RegisterPayload) => {
    try {
      set({ isLoading: true, error: null });
      const response = await api.post('/auth/register', data, { timeout: API_TIMEOUT_MS_AUTH });
      const rawUser =
        response.data && typeof response.data === 'object' ? (response.data as { user?: unknown }).user : null;
      const user = parseAuthUserPayload(rawUser);
      set({ user, isAuthenticated: Boolean(user), isLoading: false });
      return { success: true as const };
    } catch (error: unknown) {
      const firstError = isAxiosError(error) ? readRegisterFirstError((error as AxiosError).response) : null;
      const responseData = isAxiosError(error) ? error.response?.data : undefined;
      const rawMsg =
        firstError?.message ||
        (typeof responseData === 'object' && responseData !== null && 'message' in responseData
          ? String((responseData as { message?: unknown }).message || '')
          : '');
      const msgStr = typeof rawMsg === 'string' ? rawMsg : '';
      const looksTechnical = /Invalid `prisma\.|PrismaClient|prisma\.|PANIC/i.test(msgStr);
      const safeMessage = looksTechnical
        ? 'Falha no cadastro. Tente novamente.'
        : msgStr || 'Falha no cadastro. Tente novamente.';
      let code: string | undefined =
        typeof responseData === 'object' && responseData !== null && 'code' in responseData
          ? String((responseData as { code?: unknown }).code || '')
          : undefined;
      if (!code) code = undefined;
      set({ error: safeMessage, isLoading: false });
      return {
        success: false as const,
        message: safeMessage,
        code,
        fieldPath: firstError?.path,
        fieldMessage: firstError?.message,
      };
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },
}));
