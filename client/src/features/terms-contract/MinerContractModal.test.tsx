/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MinerContractModal from './MinerContractModal';
import { api } from '../../shared/auth/auth.store';

vi.mock('../../shared/auth/auth.store', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const getMock = api.get as unknown as ReturnType<typeof vi.fn>;
const postMock = api.post as unknown as ReturnType<typeof vi.fn>;
const clauses = ['age', 'game', 'bots'];
const unsigned = { ok: true, version: '2026-10-19', clauses, signed: false, signedAt: null, certificate: null };

async function mount(path = '/dashboard') {
  render(<MemoryRouter initialEntries={[path]}><MinerContractModal /></MemoryRouter>);
  await act(async () => { await Promise.resolve(); });
  await act(async () => { vi.advanceTimersByTime(1600); });
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  getMock.mockResolvedValue({ data: unsigned });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('MinerContractModal', () => {
  it('opens for an unsigned player; the seal stays locked until every clause is stamped', async () => {
    await mount();
    expect(screen.getByTestId('miner-contract')).toBeInTheDocument();
    expect(screen.getByTestId('contract-seal')).toBeDisabled();
    fireEvent.click(screen.getByTestId('clause-age'));
    fireEvent.click(screen.getByTestId('clause-game'));
    expect(screen.getByTestId('contract-seal')).toBeDisabled();
    fireEvent.click(screen.getByTestId('clause-bots'));
    expect(screen.getByTestId('clause-bots')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('contract-seal')).toBeEnabled();
  });

  it('a short press does not sign; holding the seal signs with all stamps and shows the certificate', async () => {
    postMock.mockResolvedValue({ data: { ...unsigned, signed: true, signedAt: '2026-10-19T18:00:00Z', certificate: 'BM-000007-20261019' } });
    await mount();
    clauses.forEach((c) => fireEvent.click(screen.getByTestId(`clause-${c}`)));
    const seal = screen.getByTestId('contract-seal');
    fireEvent.pointerDown(seal);
    await act(async () => { vi.advanceTimersByTime(400); });
    fireEvent.pointerUp(seal);
    expect(postMock).not.toHaveBeenCalled();
    fireEvent.pointerDown(seal);
    await act(async () => { vi.advanceTimersByTime(1300); });
    await act(async () => { await Promise.resolve(); });
    expect(postMock).toHaveBeenCalledWith('/terms/contract/sign', { version: '2026-10-19', stamped: clauses });
    expect(screen.getByTestId('contract-signed')).toBeInTheDocument();
  });

  it('"read later" hides it for this session', async () => {
    await mount();
    fireEvent.click(screen.getByText('contract.later'));
    expect(screen.queryByTestId('miner-contract')).toBeNull();
    expect(sessionStorage.getItem('blockminer:contract-later')).toBe('2026-10-19');
  });

  it('not shown when already signed, on admin pages, or on top of another popup', async () => {
    getMock.mockResolvedValue({ data: { ...unsigned, signed: true } });
    await mount();
    expect(screen.queryByTestId('miner-contract')).toBeNull();
    cleanup();

    getMock.mockResolvedValue({ data: unsigned });
    await mount('/admin/dashboard');
    expect(screen.queryByTestId('miner-contract')).toBeNull();
    cleanup();

    const other = document.createElement('div');
    other.setAttribute('role', 'dialog');
    document.body.appendChild(other);
    await mount();
    expect(screen.queryByTestId('miner-contract')).toBeNull();
    other.remove();
    await act(async () => { vi.advanceTimersByTime(1600); });
    expect(screen.getByTestId('miner-contract')).toBeInTheDocument();
  });
});
