import type { AxiosResponse } from 'axios';
import { api } from '../../../shared/auth/auth.store';

export type AdminAuthCheckResponse = {
  ok: boolean;
};

export type AdminLoginResponse = {
  ok: boolean;
  message?: string;
  code?: string;
};

export type AdminLoginRequestBody = {
  email: string;
  securityCode: string;
  password: string;
};

/** Validates `admin_session` with the server. */
export async function fetchAdminAuthOk(): Promise<boolean> {
  try {
    const res = await api.get<AdminAuthCheckResponse>('/admin/auth/check');
    return Boolean(res.data?.ok);
  } catch {
    return false;
  }
}

export function adminLogin(
  body: AdminLoginRequestBody,
): Promise<AxiosResponse<AdminLoginResponse>> {
  return api.post<AdminLoginResponse>('/admin/auth/login', body);
}

export function adminLogout(): Promise<AxiosResponse<{ ok: boolean }>> {
  return api.post<{ ok: boolean }>('/admin/auth/logout');
}

/** Safe `response.data.message` from an axios-like error object. */
export function readAxiosResponseMessage(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const response = 'response' in err ? (err as { response?: unknown }).response : undefined;
  if (typeof response !== 'object' || response === null) return undefined;
  const data = 'data' in response ? (response as { data?: unknown }).data : undefined;
  if (typeof data !== 'object' || data === null) return undefined;
  const message = 'message' in data ? (data as { message?: unknown }).message : undefined;
  return typeof message === 'string' ? message : undefined;
}
