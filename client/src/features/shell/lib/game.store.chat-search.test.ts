import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());

vi.mock('../../../shared/auth/auth.store', () => ({
  api: { get: apiGet },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('socket.io-client', () => ({ io: vi.fn() }));

import { useGameStore } from './game.store';

describe('searchChatUsers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiGet.mockReset();
    useGameStore.setState({ chatUserHits: [] });
  });

  afterEach(() => {
    useGameStore.getState().searchChatUsers('');
    vi.useRealTimers();
  });

  it('does not request a query shorter than 3 characters', () => {
    useGameStore.getState().searchChatUsers('be');
    vi.advanceTimersByTime(1_000);
    expect(apiGet).not.toHaveBeenCalled();
    expect(useGameStore.getState().chatUserHits).toEqual([]);
  });

  it('waits out the debounce and keeps only id and username', async () => {
    apiGet.mockResolvedValue({
      data: { ok: true, users: [{ id: 9, username: 'bea', email: 'bea@example.com', balance: 10 }] },
    });
    useGameStore.getState().searchChatUsers('bea');
    expect(apiGet).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(apiGet).toHaveBeenCalledWith('/chat/users', { params: { q: 'bea' } });
    expect(useGameStore.getState().chatUserHits).toEqual([{ id: 9, username: 'bea' }]);
  });

  it('drops a slow response after a newer query', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    apiGet.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    apiGet.mockResolvedValueOnce({ data: { ok: true, users: [{ id: 3, username: 'cleo' }] } });

    useGameStore.getState().searchChatUsers('bea');
    await vi.advanceTimersByTimeAsync(300);
    useGameStore.getState().searchChatUsers('cleo');
    await vi.advanceTimersByTimeAsync(300);
    resolveFirst({ data: { ok: true, users: [{ id: 9, username: 'bea' }] } });
    await Promise.resolve();
    expect(useGameStore.getState().chatUserHits).toEqual([{ id: 3, username: 'cleo' }]);
  });
});
