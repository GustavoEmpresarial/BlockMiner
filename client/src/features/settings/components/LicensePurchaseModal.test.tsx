/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LicensePurchaseModal from './LicensePurchaseModal';
import { api } from '../../../shared/auth/auth.store';

vi.mock('../../../shared/auth/auth.store', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'es' } }) }));

const getMock = api.get as unknown as ReturnType<typeof vi.fn>;
const postMock = api.post as unknown as ReturnType<typeof vi.fn>;
const URL_OK = `/media/certificates/${'c'.repeat(32)}.webp`;
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function payAs(name: string) {
  fireEvent.change(screen.getByLabelText('profilePhoto.certificate_name_label'), { target: { value: name } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'profilePhoto.modal_confirm' }));
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe('LicensePurchaseModal', () => {
  it('pays, generates in the site language and shows the final certificate with a download link', async () => {
    vi.useFakeTimers();
    postMock.mockResolvedValue({ data: { ok: true } });
    getMock.mockResolvedValue({ data: { ok: true, quotes: [], certificate: { status: 'ready', url: URL_OK, holderName: 'Ana', attemptsLeft: 1, errorCode: null } } });
    const onPaid = vi.fn();
    render(<MemoryRouter><LicensePurchaseModal currency="SHIB" amount="181818.18181819" channel="offers" onClose={vi.fn()} onPaid={onPaid} /></MemoryRouter>);
    await payAs('Ana');
    expect(postMock.mock.calls[1]).toEqual(['/avatar/certificate', { name: 'Ana', language: 'es' }]);
    expect(onPaid).toHaveBeenCalled();
    expect(screen.getByTestId('license-purchase-modal')).toHaveAttribute('data-step', 'generating');
    await act(async () => { vi.advanceTimersByTime(4100); });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('license-modal-final')).toHaveAttribute('src', URL_OK);
    expect(screen.getByRole('link', { name: /profilePhoto.certificate_download/ })).toHaveAttribute('href', URL_OK);
  });

  it('paid but generation could not start: says the license is active and how to generate later', async () => {
    postMock
      .mockResolvedValueOnce({ data: { ok: true } })
      .mockRejectedValueOnce(Object.assign(new Error('x'), { isAxiosError: true, response: { status: 503, data: { code: 'AVATAR_CERT_NOT_CONFIGURED' } } }));
    render(<MemoryRouter><LicensePurchaseModal currency="POL" amount="10.9" channel="offers" onClose={vi.fn()} onPaid={vi.fn()} /></MemoryRouter>);
    await payAs('Ana');
    expect(screen.getByTestId('license-purchase-modal')).toHaveAttribute('data-step', 'generate_failed');
    expect(screen.getByText('profilePhoto.purchased')).toBeInTheDocument();
    expect(screen.getByText('profilePhoto.errors.AVATAR_CERT_NOT_CONFIGURED')).toBeInTheDocument();
  });

  it('cannot be closed while paying or generating', async () => {
    postMock.mockImplementation(() => new Promise(() => {}));
    const onClose = vi.fn();
    render(<MemoryRouter><LicensePurchaseModal currency="POL" amount="10.9" channel="offers" onClose={onClose} onPaid={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'common.close' })).toBeInTheDocument();
    await payAs('Ana');
    expect(screen.queryByRole('button', { name: 'common.close' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
