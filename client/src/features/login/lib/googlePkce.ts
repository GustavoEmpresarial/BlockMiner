/** Browser PKCE (S256) helpers for Google OAuth redirect flow. */

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Base64Url(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64UrlEncodeBytes(new Uint8Array(buf));
}

export async function createGooglePkcePair(): Promise<{ verifier: string; challenge: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64UrlEncodeBytes(bytes);
  const challenge = await sha256Base64Url(verifier);
  return { verifier, challenge };
}

export function createGoogleOAuthState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return base64UrlEncodeBytes(bytes);
}

export function googlePkceSessionKey(state: string): string {
  return `google_pkce_${state}`;
}
