/** CSRF double-submit fallback when third-party iframe cookies are blocked (genesisdao embed). */
let memoryCsrf: string | null = null;

export function setMemoryCsrf(token: string | null | undefined): void {
  if (typeof token === 'string' && token.trim().length >= 16) {
    memoryCsrf = token.trim();
  }
}

export function getMemoryCsrf(): string | null {
  return memoryCsrf;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [rawKey, ...rawVal] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rawVal.join('=') || '');
  }
  return null;
}

export function resolveCsrfTokenForRequest(): string | null {
  return readCookie('blockminer_csrf') || memoryCsrf;
}

export function captureCsrfFromPayload(data: unknown): void {
  if (typeof data !== 'object' || data === null) return;
  const token = (data as { csrfToken?: unknown }).csrfToken;
  if (typeof token === 'string') setMemoryCsrf(token);
}

export function isEmbeddedPartnerFrame(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** Chrome/Safari third-party cookie access in partner iframes (best-effort). */
export async function requestPartnerStorageAccess(): Promise<void> {
  if (!isEmbeddedPartnerFrame()) return;
  const doc = document as Document & { requestStorageAccess?: () => Promise<void> };
  if (typeof doc.requestStorageAccess !== 'function') return;
  try {
    await doc.requestStorageAccess();
  } catch {
    /* user denied or browser unsupported — memory CSRF still works */
  }
}
