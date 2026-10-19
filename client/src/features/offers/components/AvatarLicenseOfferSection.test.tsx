/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AvatarLicenseOfferSection } from './AvatarLicenseOfferSection';
import { api } from '../../../shared/auth/auth.store';

vi.mock('../../../shared/auth/auth.store', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  useAuthStore: (sel: (s: { user: { username: string } }) => unknown) => sel({ user: { username: 'gugu' } }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const getMock = api.get as unknown as ReturnType<typeof vi.fn>;
const postMock = api.post as unknown as ReturnType<typeof vi.fn>;
const status = {
  priceUsd: 1.5,
  prices: { offers: 1, settings: 1.5 },
  licenseActive: false,
  licenseExpiresAt: null,
  canRenew: true,
  uploadBlocked: false,
  avatarUrl: null,
  quotes: [{ currency: 'POL', amount: '16.17000000', amounts: { offers: '10.78000000', settings: '16.17000000' }, balance: '20.00000000' }],
};
const renderIt = () => render(<MemoryRouter><AvatarLicenseOfferSection /></MemoryRouter>);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AvatarLicenseOfferSection', () => {
  it('sells at the Offers price (US$ 1) and sends channel=offers', async () => {
    getMock.mockResolvedValue({ data: { ok: true, ...status } });
    postMock.mockResolvedValue({ data: { ok: true } });
    renderIt();
    await waitFor(() => expect(screen.getByTestId('avatar-license-offer')).toBeInTheDocument());
    expect(screen.getByTestId('avatar-offer-price')).toHaveTextContent('US$ 1');
    expect(screen.getByTestId('license-certificate')).toHaveTextContent('profilePhoto.certificate_your_name');
    expect(screen.getByText('US$ 1.50')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-amount')).toHaveTextContent('10.78000000 POL');
    fireEvent.click(screen.getByRole('button', { name: 'profilePhoto.buy' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(postMock.mock.calls[0][1]).toEqual({ currency: 'POL', expectedAmount: '10.78000000', channel: 'offers' });
  });

  it('with an active license it points to Settings instead of selling again', async () => {
    getMock.mockResolvedValue({ data: { ok: true, ...status, licenseActive: true, canRenew: false, licenseExpiresAt: new Date(Date.now() + 200 * 86_400_000).toISOString() } });
    renderIt();
    await waitFor(() => expect(screen.getByTestId('avatar-license-offer')).toHaveAttribute('data-state', 'active'));
    expect(screen.queryByRole('button', { name: 'profilePhoto.buy' })).toBeNull();
    expect(screen.getByTestId('certificate-form')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'profilePhoto.go_to_settings' })).toHaveAttribute('href', '/settings');
  });

  it('renders nothing when the status cannot be loaded (rest of the page unaffected)', async () => {
    getMock.mockResolvedValue({ data: { ok: true } });
    const { container } = renderIt();
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="avatar-license-offer"]')).toBeNull();
  });
});
