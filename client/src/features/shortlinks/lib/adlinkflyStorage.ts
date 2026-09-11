export const ADLINKFLY_TOKEN_KEY = 'sl_adlinkfly_token';
export const ADLINKFLY_EXTERNAL_URL_KEY = 'sl_adlinkfly_external_url';

export function syncAdlinkflyToken(token: string | null | undefined): void {
  if (token) sessionStorage.setItem(ADLINKFLY_TOKEN_KEY, token);
  else sessionStorage.removeItem(ADLINKFLY_TOKEN_KEY);
}

export function syncAdlinkflyExternalUrl(url: string | null | undefined): void {
  if (url) sessionStorage.setItem(ADLINKFLY_EXTERNAL_URL_KEY, url);
  else sessionStorage.removeItem(ADLINKFLY_EXTERNAL_URL_KEY);
}

export function readAdlinkflyExternalUrl(): string {
  return sessionStorage.getItem(ADLINKFLY_EXTERNAL_URL_KEY) ?? '';
}

export function readAdlinkflyToken(): string | null {
  return sessionStorage.getItem(ADLINKFLY_TOKEN_KEY);
}

export function clearAdlinkflySessionStorage(): void {
  sessionStorage.removeItem(ADLINKFLY_TOKEN_KEY);
  sessionStorage.removeItem(ADLINKFLY_EXTERNAL_URL_KEY);
}
