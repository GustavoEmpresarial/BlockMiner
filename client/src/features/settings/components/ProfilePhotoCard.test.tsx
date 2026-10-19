/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProfilePhotoCardRaw, { profilePhotoState } from './ProfilePhotoCard';
const ProfilePhotoCard = (p: { displayName: string }) => (
  <MemoryRouter>
    <ProfilePhotoCardRaw {...p} />
  </MemoryRouter>
);
import { api } from '../../../shared/auth/auth.store';
import { toast } from 'sonner';
import type { AvatarStatus } from '../lib/avatar.api';

vi.mock('../../../shared/auth/auth.store', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o && 'date' in o ? `${k}:${String(o.date)}` : k), i18n: { language: 'en' } }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const DAY = 86_400_000;
const quotes: AvatarStatus['quotes'] = [
  { currency: 'POL', amount: '7.50000000', amounts: { offers: '5.00000000', settings: '7.50000000' }, balance: '10.00000000' },
  { currency: 'USDT', amount: '1.50000000', amounts: { offers: '1.00000000', settings: '1.50000000' }, balance: '0.50000000' },
  { currency: 'USDC', amount: '1.00000000', balance: '0.00000000' },
  { currency: 'BTC', amount: null, balance: '0.00000000' },
  { currency: 'ETH', amount: '0.00025000', balance: '0.00000000' },
  { currency: 'SHIB', amount: '181818.18181819', balance: '0.00000000' },
];
const base: AvatarStatus = { priceUsd: 1.5, prices: { offers: 1, settings: 1.5 }, licenseActive: false, licenseExpiresAt: null, canRenew: true, uploadBlocked: false, avatarUrl: null, quotes };
const getMock = api.get as unknown as ReturnType<typeof vi.fn>;
const postMock = api.post as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => getMock.mockResolvedValue({ data: { ok: true, ...base } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('profilePhotoState', () => {
  const now = Date.parse('2026-10-19T00:00:00Z');
  it('maps the server status to the card state', () => {
    expect(profilePhotoState(null, now)).toBe('loading');
    expect(profilePhotoState({ ...base }, now)).toBe('no_license');
    expect(profilePhotoState({ ...base, uploadBlocked: true }, now)).toBe('blocked');
    expect(profilePhotoState({ ...base, licenseActive: true, licenseExpiresAt: new Date(now + 200 * DAY).toISOString() }, now)).toBe('active');
    expect(profilePhotoState({ ...base, licenseActive: true, licenseExpiresAt: new Date(now + 10 * DAY).toISOString() }, now)).toBe('expiring');
    expect(profilePhotoState({ ...base, licenseExpiresAt: new Date(now - DAY).toISOString() }, now)).toBe('expired');
  });
});

describe('ProfilePhotoCard', () => {
  it('no license: buying needs a confirm step and sends the shown amount with an idempotency key', async () => {
    postMock.mockResolvedValue({ data: { ok: true, expiresAt: '2027-10-19T00:00:00.000Z' } });
    render(<ProfilePhotoCard displayName="ana" />);
    await waitFor(() => expect(screen.getByTestId('profile-photo-card')).toHaveAttribute('data-state', 'no_license'));
    expect(screen.getByTestId('avatar-amount')).toHaveTextContent('7.50000000 POL');
    expect(screen.getByText('profilePhoto.license_price')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-offers-link')).toHaveAttribute('href', '/offers');
    fireEvent.click(screen.getByRole('button', { name: 'profilePhoto.buy' }));
    expect(postMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('avatar-confirm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    const [url, body, cfg] = postMock.mock.calls[0];
    expect(url).toBe('/avatar/license');
    expect(body).toEqual({ currency: 'POL', expectedAmount: '7.50000000', channel: 'settings' });
    expect(cfg.headers['Idempotency-Key']).toMatch(/^[a-f0-9]{32}$/);
    expect(toast.success).toHaveBeenCalledWith('profilePhoto.purchased');
  });

  it('insufficient balance or no price: the buy button is disabled', async () => {
    render(<ProfilePhotoCard displayName="ana" />);
    await waitFor(() => expect(screen.getByTestId('profile-photo-card')).toHaveAttribute('data-state', 'no_license'));
    fireEvent.change(screen.getByLabelText('profilePhoto.pay_with'), { target: { value: 'USDT' } });
    expect(screen.getByRole('button', { name: 'profilePhoto.buy' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('profilePhoto.pay_with'), { target: { value: 'BTC' } });
    expect(screen.getByTestId('avatar-amount')).toHaveTextContent('profilePhoto.price_unavailable');
    expect(screen.getByRole('button', { name: 'profilePhoto.buy' })).toBeDisabled();
  });

  it('a server error code is shown translated', async () => {
    postMock.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { status: 409, data: { code: 'AVATAR_QUOTE_CHANGED' } } }));
    render(<ProfilePhotoCard displayName="ana" />);
    await waitFor(() => expect(screen.getByTestId('profile-photo-card')).toHaveAttribute('data-state', 'no_license'));
    fireEvent.click(screen.getByRole('button', { name: 'profilePhoto.buy' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('profilePhoto.errors.AVATAR_QUOTE_CHANGED'));
  });

  it('active license: upload control shown, oversized file rejected before any request', async () => {
    getMock.mockResolvedValue({ data: { ok: true, ...base, licenseActive: true, licenseExpiresAt: new Date(Date.now() + 200 * DAY).toISOString() } });
    render(<ProfilePhotoCard displayName="ana" />);
    await waitFor(() => expect(screen.getByTestId('profile-photo-card')).toHaveAttribute('data-state', 'active'));
    expect(screen.queryByRole('button', { name: 'profilePhoto.buy' })).toBeNull();
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('avatar-file'), { target: { files: [big] } });
    expect(toast.error).toHaveBeenCalledWith('profilePhoto.errors.AVATAR_UPLOAD_TOO_LARGE');
    expect(postMock).not.toHaveBeenCalled();
  });

  it('blocked: no buy, no upload', async () => {
    getMock.mockResolvedValue({ data: { ok: true, ...base, uploadBlocked: true, licenseActive: true, licenseExpiresAt: new Date(Date.now() + 200 * DAY).toISOString() } });
    render(<ProfilePhotoCard displayName="ana" />);
    await waitFor(() => expect(screen.getByTestId('profile-photo-card')).toHaveAttribute('data-state', 'blocked'));
    expect(screen.getByText('profilePhoto.blocked')).toBeInTheDocument();
    expect(screen.queryByTestId('avatar-file')).toBeNull();
    expect(screen.queryByRole('button', { name: 'profilePhoto.buy' })).toBeNull();
  });
});
