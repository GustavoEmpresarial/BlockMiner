import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../i18n/locales/pt-BR.json';
import PartsPage from './PartsPage';
import { getPartsOverview } from './lib/parts.api';
import type { PartsOverviewResponse } from './lib/parts.types';

vi.mock('./lib/parts.api', () => ({
  getPartsOverview: vi.fn(),
}));

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'pt-BR',
  resources: { 'pt-BR': { translation: ptBR } },
  interpolation: { escapeValue: false },
});

const mockedGet = vi.mocked(getPartsOverview);

afterEach(() => {
  cleanup();
  mockedGet.mockReset();
});

function renderPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <PartsPage />
    </I18nextProvider>,
  );
}

function resolvedOverview(data: PartsOverviewResponse) {
  return { data } as unknown as Awaited<ReturnType<typeof getPartsOverview>>;
}

describe('PartsPage', () => {
  it('shows the inventory at zero and the price hint without a buy action', async () => {
    mockedGet.mockResolvedValue(
      resolvedOverview({
        ok: true,
        parts: [
          { slug: 'power_cable', imageUrl: '/media/parts/power_cable.jpg', quantity: 0 },
          { slug: 'asic_chip', imageUrl: '/media/parts/asic_chip.jpg', quantity: 0 },
        ],
        machines: [],
      }),
    );

    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Carregando peças...');
    expect(await screen.findByText('Cabo de força')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma máquina da loja para precificar agora.')).toBeInTheDocument();
    expect(screen.getByText(/Ainda não dá para montar nem comprar com peças/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows owned parts against a machine cost and still has no purchase control', async () => {
    mockedGet.mockResolvedValue(
      resolvedOverview({
        ok: true,
        parts: [{ slug: 'power_cable', imageUrl: '/media/parts/power_cable.jpg', quantity: 1 }],
        machines: [
          {
            id: 4,
            slug: 'quantum-forge',
            name: 'Quantum Forge',
            imageUrl: null,
            baseHashRate: 10,
            band: 'starter',
            costs: [{ slug: 'power_cable', required: 2, owned: 1 }],
          },
        ],
      }),
    );

    renderPage();

    expect(await screen.findByText('Quantum Forge')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuemax', '2');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the load error and no purchase control', async () => {
    mockedGet.mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar as peças.');
    await waitFor(() => {
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });
});
