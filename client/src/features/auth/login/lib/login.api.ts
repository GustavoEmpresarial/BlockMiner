import { api } from '../../../../shared/auth/auth.store';
import { API_TIMEOUT_MS_AUTH } from '../../../../shared/utils/apiTimeout';
import type { AuthLoginRequestBody } from './auth.types';

export async function postAuthLogin(body: AuthLoginRequestBody) {
  return api.post('/auth/login', body, { timeout: API_TIMEOUT_MS_AUTH });
}

export async function postAuthSatspayExchange(body: {
  code: string;
  codeVerifier: string;
  redirectUri?: string;
}) {
  return api.post('/auth/satspay', body, { timeout: API_TIMEOUT_MS_AUTH });
}

export async function getAuthSatspayConfig(): Promise<{
  enabled: boolean;
  clientId: string;
  redirectUri: string;
  sdkUrl: string;
  theme: string;
}> {
  const { data } = await api.get('/auth/satspay/config', { timeout: API_TIMEOUT_MS_AUTH });
  const s = data?.satspay ?? {};
  return {
    enabled: Boolean(s.enabled),
    clientId: String(s.clientId || ''),
    redirectUri: String(s.redirectUri || ''),
    sdkUrl: String(s.sdkUrl || 'https://www.satspay.pro/sdk/satspay-auth.v2.js'),
    theme: String(s.theme || 'light'),
  };
}

export async function postAuthGoogleExchange(body: {
  code: string;
  codeVerifier: string;
  redirectUri?: string;
}) {
  return api.post('/auth/google', body, { timeout: API_TIMEOUT_MS_AUTH });
}

export async function getAuthGoogleConfig(): Promise<{
  enabled: boolean;
  clientId: string;
  redirectUri: string;
  authUrl: string;
  scope: string;
}> {
  const { data } = await api.get('/auth/google/config', { timeout: API_TIMEOUT_MS_AUTH });
  const g = data?.google ?? {};
  return {
    enabled: Boolean(g.enabled),
    clientId: String(g.clientId || ''),
    redirectUri: String(g.redirectUri || ''),
    authUrl: String(g.authUrl || 'https://accounts.google.com/o/oauth2/v2/auth'),
    scope: String(g.scope || 'openid email profile'),
  };
}
