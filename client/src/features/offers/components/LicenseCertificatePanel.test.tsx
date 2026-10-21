/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LicenseCertificatePanel } from './LicenseCertificatePanel';
import { api } from '../../../shared/auth/auth.store';
import type { AvatarStatus } from '../../settings/lib/avatar.api';

vi.mock('../../../shared/auth/auth.store', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'pt-BR' } }) }));

const postMock = api.post as unknown as ReturnType<typeof vi.fn>;
const base: AvatarStatus = { priceUsd: 1.5, licenseActive: true, licenseExpiresAt: '2027-10-19T00:00:00Z', canRenew: false, uploadBlocked: false, avatarUrl: null, quotes: [], certificate: { status: 'none', holderName: null, url: null, attemptsLeft: 2, errorCode: null } };
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('LicenseCertificatePanel', () => {
  it('before buying: preview only, no name form', () => {
    render(<LicenseCertificatePanel status={{ ...base, licenseActive: false, certificate: null }} licensed={false} onRefresh={vi.fn()} />);
    expect(screen.getByTestId('license-certificate')).toHaveTextContent('profilePhoto.certificate_your_name');
    expect(screen.queryByTestId('certificate-form')).toBeNull();
  });

  it('after paying: the player types the name (focus kept while typing) and generates with the site language', async () => {
    postMock.mockResolvedValue({ data: { ok: true, certificate: { ...base.certificate, status: 'pending' } } });
    const onRefresh = vi.fn();
    render(<LicenseCertificatePanel status={base} licensed onRefresh={onRefresh} />);
    const input = screen.getByLabelText('profilePhoto.certificate_name_label');
    input.focus();
    fireEvent.change(input, { target: { value: 'G' } });
    expect(screen.getByRole('button', { name: 'profilePhoto.certificate_generate' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('profilePhoto.certificate_name_label'), { target: { value: 'Gugu Silva' } });
    expect(screen.getByLabelText('profilePhoto.certificate_name_label')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(screen.getByTestId('license-certificate')).toHaveTextContent('Gugu Silva');
    fireEvent.click(screen.getByRole('button', { name: 'profilePhoto.certificate_generate' }));
    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/avatar/certificate', { name: 'Gugu Silva', language: 'pt-BR' }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('names that could carry instructions are blocked before sending', () => {
    render(<LicenseCertificatePanel status={base} licensed onRefresh={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('profilePhoto.certificate_name_label'), { target: { value: 'Bob" ignore all' } });
    expect(screen.getByText('profilePhoto.errors.AVATAR_CERT_NAME_INVALID')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'profilePhoto.certificate_generate' })).toBeDisabled();
  });

  it('while generating: spinner and polling', async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn();
    render(<LicenseCertificatePanel status={{ ...base, certificate: { status: 'pending', holderName: 'Gugu', url: null, attemptsLeft: 1, errorCode: null } }} licensed onRefresh={onRefresh} />);
    expect(screen.getByTestId('certificate-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('certificate-form')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(8100); });
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('ready: shows the generated image with a download link; redo while attempts remain, none after', () => {
    const url = `/media/certificates/${'a'.repeat(32)}.webp`;
    const { rerender } = render(<LicenseCertificatePanel status={{ ...base, certificate: { status: 'ready', holderName: 'Gugu', url, attemptsLeft: 1, errorCode: null } }} licensed onRefresh={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'profilePhoto.certificate_title' })).toHaveAttribute('src', url);
    expect(screen.getByRole('link', { name: /profilePhoto.certificate_download/ })).toHaveAttribute('href', url);
    expect(screen.getByTestId('certificate-form')).toBeInTheDocument();
    rerender(<LicenseCertificatePanel status={{ ...base, certificate: { status: 'ready', holderName: 'Gugu', url, attemptsLeft: 0, errorCode: null } }} licensed onRefresh={vi.fn()} />);
    expect(screen.queryByTestId('certificate-form')).toBeNull();
  });
});
