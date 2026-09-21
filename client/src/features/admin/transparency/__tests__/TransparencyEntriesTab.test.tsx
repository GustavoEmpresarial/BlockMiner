import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import TransparencyEntriesTab from '../components/TransparencyEntriesTab';
import type { TransparencyEntryRow } from '../components/adminTransparency.types';

afterEach(() => cleanup());

const MOCK_ENTRIES: TransparencyEntryRow[] = [
  {
    id: 1,
    type: 'expense',
    category: 'infrastructure',
    name: 'Hetzner AX52 Dedicated Server',
    provider: 'Hetzner Online',
    providerUrl: 'https://hetzner.com',
    amountUsd: 120.0,
    currencyCode: 'USD',
    period: 'monthly',
    isOnChain: false,
    isPaid: true,
    isActive: true,
    sortOrder: 0,
  },
  {
    id: 2,
    type: 'expense',
    category: 'tooling',
    name: 'Cloudflare Pro & Turnstile',
    provider: 'Cloudflare Inc',
    providerUrl: 'https://cloudflare.com',
    amountUsd: 25.0,
    currencyCode: 'USD',
    period: 'monthly',
    isOnChain: false,
    isPaid: false,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 3,
    type: 'income',
    category: 'misc',
    incomeCategory: 'sponsorship',
    name: 'Top Banner Sponsor',
    provider: 'CryptoAds Network',
    amountUsd: 300.0,
    currencyCode: 'USD',
    period: 'monthly',
    isOnChain: false,
    isPaid: true,
    isActive: true,
    sortOrder: 2,
  },
];

describe('TransparencyEntriesTab', () => {
  it('renders summary metric cards correctly', () => {
    render(
      <TransparencyEntriesTab
        entries={MOCK_ENTRIES}
        loading={false}
        onRefresh={vi.fn()}
      />,
    );

    // Total monthly expense: 120 + 25 = 145.00
    expect(screen.getByText('Despesas Mensais')).toBeInTheDocument();
    expect(screen.getByText('$145.00')).toBeInTheDocument();

    // Total monthly income: 300.00
    expect(screen.getByText('Receitas Mensais')).toBeInTheDocument();
    expect(screen.getAllByText('$300.00').length).toBeGreaterThanOrEqual(1);

    // Net balance: 300 - 145 = +$155.00
    expect(screen.getByText('Balanço Líquido (Mês)')).toBeInTheDocument();
    expect(screen.getByText('+$155.00')).toBeInTheDocument();
  });

  it('renders all entry rows in the table', () => {
    render(
      <TransparencyEntriesTab
        entries={MOCK_ENTRIES}
        loading={false}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText('Hetzner AX52 Dedicated Server')).toBeInTheDocument();
    expect(screen.getByText('Cloudflare Pro & Turnstile')).toBeInTheDocument();
    expect(screen.getByText('Top Banner Sponsor')).toBeInTheDocument();
  });

  it('filters rows by type (Despesas / Receitas)', () => {
    render(
      <TransparencyEntriesTab
        entries={MOCK_ENTRIES}
        loading={false}
        onRefresh={vi.fn()}
      />,
    );

    // Click on "Despesas" filter button
    const expenseBtn = screen.getByRole('button', { name: /Despesas/i });
    fireEvent.click(expenseBtn);

    expect(screen.getByText('Hetzner AX52 Dedicated Server')).toBeInTheDocument();
    expect(screen.getByText('Cloudflare Pro & Turnstile')).toBeInTheDocument();
    expect(screen.queryByText('Top Banner Sponsor')).not.toBeInTheDocument();

    // Click on "Receitas" filter button
    const incomeBtn = screen.getByRole('button', { name: /Receitas/i });
    fireEvent.click(incomeBtn);

    expect(screen.queryByText('Hetzner AX52 Dedicated Server')).not.toBeInTheDocument();
    expect(screen.getByText('Top Banner Sponsor')).toBeInTheDocument();
  });

  it('filters rows by search input', () => {
    render(
      <TransparencyEntriesTab
        entries={MOCK_ENTRIES}
        loading={false}
        onRefresh={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText(/Buscar por nome/i);
    fireEvent.change(searchInput, { target: { value: 'Cloudflare' } });

    expect(screen.getByText('Cloudflare Pro & Turnstile')).toBeInTheDocument();
    expect(screen.queryByText('Hetzner AX52 Dedicated Server')).not.toBeInTheDocument();
    expect(screen.queryByText('Top Banner Sponsor')).not.toBeInTheDocument();
  });

  it('opens create modal when clicking "+ Nova Entrada"', () => {
    render(
      <TransparencyEntriesTab
        entries={MOCK_ENTRIES}
        loading={false}
        onRefresh={vi.fn()}
      />,
    );

    const newBtn = screen.getByRole('button', { name: /Nova Entrada/i });
    fireEvent.click(newBtn);

    expect(screen.getByText('Nova Entrada de Transparência')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Ex: Servidor Dedicado Hetzner/i)).toBeInTheDocument();
  });
});
