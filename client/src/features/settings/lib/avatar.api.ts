import { isAxiosError } from 'axios';
import { api } from '../../../shared/auth/auth.store';

/** The license is paid in POL or SHIB only. */
export const AVATAR_CURRENCIES = ['POL', 'SHIB'] as const;
export type AvatarCurrency = (typeof AVATAR_CURRENCIES)[number];

export type AvatarChannel = 'offers' | 'settings';
export type AvatarQuote = {
  currency: AvatarCurrency;
  /** Settings price. */
  amount: string | null;
  amounts?: Partial<Record<AvatarChannel, string | null>>;
  balance: string;
};

export function quoteAmount(q: AvatarQuote | null | undefined, channel: AvatarChannel): string | null {
  if (!q) return null;
  const v = q.amounts?.[channel];
  if (v !== undefined) return v;
  return channel === 'settings' ? q.amount : null;
}
export type AvatarStatus = {
  priceUsd: number;
  prices?: Partial<Record<AvatarChannel, number>>;
  licenseActive: boolean;
  licenseExpiresAt: string | null;
  canRenew: boolean;
  uploadBlocked: boolean;
  avatarUrl: string | null;
  /** Null when there is no license in force. */
  certificate?: AvatarCertificate | null;
  quotes: AvatarQuote[];
};

export type AvatarCertificate = {
  status: 'none' | 'pending' | 'ready' | 'failed';
  holderName: string | null;
  url: string | null;
  attemptsLeft: number;
  errorCode: string | null;
};

/** Mirrors the server rule: letters, digits, space and . ' _ - , 2 to 24 characters. */
export function isValidHolderName(v: string): boolean {
  const name = v.replace(/ {2,}/g, ' ').trim();
  return /^[\p{L}\p{N}][\p{L}\p{N} .'_-]{0,22}[\p{L}\p{N}.]$/u.test(name);
}

export async function requestAvatarCertificate(name: string, language: string): Promise<AvatarCertificate> {
  const res = await api.post<{ ok: boolean; certificate: AvatarCertificate }>('/avatar/certificate', { name: name.trim(), language });
  return res.data.certificate;
}

export async function fetchAvatarStatus(): Promise<AvatarStatus> {
  const res = await api.get<{ ok: boolean } & AvatarStatus>('/avatar');
  if (!res.data || !Array.isArray(res.data.quotes)) throw new Error('AVATAR_STATUS_INVALID');
  return res.data;
}

/** Random key per purchase attempt: a retry of the same attempt reuses it and is never charged twice. */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function purchaseAvatarLicense(
  currency: AvatarCurrency,
  expectedAmount: string,
  idempotencyKey: string,
  channel: AvatarChannel = 'settings',
) {
  const res = await api.post<{ ok: boolean; expiresAt: string }>(
    '/avatar/license',
    { currency, expectedAmount, channel },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return res.data;
}

export async function uploadAvatarPhoto(file: File): Promise<{ avatarUrl: string | null }> {
  const form = new FormData();
  form.append('file', file);
  const res = await api.post<{ ok: boolean; avatarUrl: string | null }>('/avatar/photo', form, { timeout: 60_000 });
  return res.data;
}

export async function deleteAvatarPhoto(): Promise<void> {
  await api.delete('/avatar/photo');
}

/** Stable error code from the API (AVATAR_*), or null. */
export function avatarErrorCode(error: unknown): string | null {
  if (!isAxiosError(error)) return null;
  const code = (error.response?.data as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' && /^AVATAR_[A-Z_]+$/.test(code) ? code : null;
}
