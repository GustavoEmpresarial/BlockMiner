export {
  PASTEAD_TOKEN_KEY,
  PASTEAD_EXTERNAL_URL_KEY,
} from './pasteadSession';

import { PASTEAD_TOKEN_KEY, PASTEAD_EXTERNAL_URL_KEY } from './pasteadSession';

export function syncPasteadToken(token: string | null | undefined): void {
  if (token) sessionStorage.setItem(PASTEAD_TOKEN_KEY, token);
  else sessionStorage.removeItem(PASTEAD_TOKEN_KEY);
}

export function syncPasteadExternalUrl(url: string | null | undefined): void {
  if (url) sessionStorage.setItem(PASTEAD_EXTERNAL_URL_KEY, url);
  else sessionStorage.removeItem(PASTEAD_EXTERNAL_URL_KEY);
}

export function readPasteadExternalUrl(): string {
  return sessionStorage.getItem(PASTEAD_EXTERNAL_URL_KEY) ?? '';
}

export function readPasteadToken(): string | null {
  return sessionStorage.getItem(PASTEAD_TOKEN_KEY);
}

export function clearPasteadSessionStorage(): void {
  sessionStorage.removeItem(PASTEAD_TOKEN_KEY);
  sessionStorage.removeItem(PASTEAD_EXTERNAL_URL_KEY);
}

export function readBroadcastToken(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const token = (data as { token?: unknown }).token;
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}
