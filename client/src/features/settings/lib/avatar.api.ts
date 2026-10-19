import { isAxiosError } from 'axios';
import { api } from '../../../shared/auth/auth.store';

export const AVATAR_CURRENCIES = ['POL', 'USDT', 'USDC', 'BTC', 'ETH', 'SHIB'] as const;
export type AvatarCurrency = (typeof AVATAR_CURRENCIES)[number];

export type AvatarQuote = { currency: AvatarCurrency; amount: string | null; balance: string };
export type AvatarStatus = {
  priceUsd: number;
  licenseActive: boolean;
  licenseExpiresAt: string | null;
  canRenew: boolean;
  uploadBlocked: boolean;
  avatarUrl: string | null;
  quotes: AvatarQuote[];
};

export async function fetchAvatarStatus(): Promise<AvatarStatus> {
  const res = await api.get<{ ok: boolean } & AvatarStatus>('/avatar');
  return res.data;
}

/** Random key per purchase attempt: a retry of the same attempt reuses it and is never charged twice. */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function purchaseAvatarLicense(currency: AvatarCurrency, expectedAmount: string, idempotencyKey: string) {
  const res = await api.post<{ ok: boolean; expiresAt: string }>(
    '/avatar/license',
    { currency, expectedAmount },
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
