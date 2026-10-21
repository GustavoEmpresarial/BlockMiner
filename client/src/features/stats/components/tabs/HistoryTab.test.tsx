import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import HistoryTab from './HistoryTab';
import { withProviders, baseContext } from './testHelpers';
import * as historyApi from '../../lib/stats.history.api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('HistoryTab', () => {
  it('renders search input and period filters', async () => {
    vi.spyOn(historyApi, 'fetchUserActivityHistory').mockResolvedValue({
      ok: true,
      logs: [],
      total: 0,
      page: 1,
      pageSize: 15,
      totalPages: 1,
      hasMore: false,
      categories: [],
      categoryCounts: {},
      windowDays: 30,
    });

    await act(async () => {
      render(withProviders(<HistoryTab {...baseContext()} />));
    });

    expect(screen.getByPlaceholderText(/pesquisar por ação/i)).toBeInTheDocument();
    expect(screen.getByText('24h')).toBeInTheDocument();
    expect(screen.getByText('7 dias')).toBeInTheDocument();
    expect(screen.getByText('30 dias')).toBeInTheDocument();
  });

  it('renders empty state when no activities exist', async () => {
    vi.spyOn(historyApi, 'fetchUserActivityHistory').mockResolvedValue({
      ok: true,
      logs: [],
      total: 0,
      page: 1,
      pageSize: 15,
      totalPages: 1,
      hasMore: false,
      categories: [],
      categoryCounts: {},
      windowDays: 30,
    });

    await act(async () => {
      render(withProviders(<HistoryTab {...baseContext()} />));
    });

    expect(await screen.findByText(/nenhuma atividade encontrada/i)).toBeInTheDocument();
  });

  it('renders activity logs when returned by API and triggers CSV export', async () => {
    const mockLog: historyApi.UserActivityLogItem = {
      id: 1,
      action: 'WATCH_CLAIM',
      category: 'youtube',
      categoryLabel: 'YouTube',
      title: 'Vídeo assistido',
      description: 'Ganho de +10 H/s',
      details: { hashRate: 10 },
      ip: '127.0.0.1',
      createdAt: new Date().toISOString(),
    };

    vi.spyOn(historyApi, 'fetchUserActivityHistory').mockResolvedValue({
      ok: true,
      logs: [mockLog],
      total: 1,
      page: 1,
      pageSize: 15,
      totalPages: 1,
      hasMore: false,
      categories: [{ id: 'youtube', label: 'YouTube', count: 1 }],
      categoryCounts: { youtube: 1 },
      windowDays: 30,
    });

    const clickSpy = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickSpy);
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();

    await act(async () => {
      render(withProviders(<HistoryTab {...baseContext()} />));
    });

    expect(await screen.findByText('Vídeo assistido')).toBeInTheDocument();
    expect(screen.getByText('Ganho de +10 H/s')).toBeInTheDocument();
    expect(screen.getByText('+10 H/s')).toBeInTheDocument();

    const csvBtn = screen.getByTitle(/exportar log em csv/i);
    expect(csvBtn).toBeInTheDocument();
    fireEvent.click(csvBtn);
    expect(clickSpy).toHaveBeenCalled();
  });
});
