import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../i18n/locales/pt-BR.json';
import PartsPage from './PartsPage';
import { getPartsOverview, mergeMachine } from './lib/parts.api';
import type { PartsOverviewResponse, PartMachinePriceDto, OwnedMergeCandidate } from './lib/parts.types';

vi.mock('./lib/parts.api', () => ({
  getPartsOverview: vi.fn(),
  mergeMachine: vi.fn(),
}));

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'pt-BR',
  resources: { 'pt-BR': { translation: ptBR } },
  interpolation: { escapeValue: false },
});

const mockedGet = vi.mocked(getPartsOverview);
const mockedMerge = vi.mocked(mergeMachine);

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  mockedGet.mockReset();
  mockedMerge.mockReset();
});

const testCandidate: OwnedMergeCandidate = {
  id: 4,
  minerId: 4,
  name: 'Quantum Forge',
  slug: 'quantum-forge',
  imageUrl: null,
  baseHashRate: 10,
  currentLevel: 1,
  currentTier: 'common',
  currentTierName: 'Comum',
  currentTierColor: '#94A3B8',
  currentHashRate: 10,
  ownedCount: 2,
  hasMachinePair: true,
  isMaxLevel: false,
  targetLevel: 2,
  targetTier: 'uncommon',
  targetTierName: 'Incomum',
  targetTierColor: '#10B981',
  targetHashRate: 26,
  boostPercent: 30,
  mergeFeeBlk: 0.05,
  hasBlk: true,
  hasParts: true,
  canMerge: true,
  partsRecipe: [],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <I18nextProvider i18n={i18n}>
        <PartsPage />
      </I18nextProvider>
    </MemoryRouter>,
  );
}

function resolvedOverview(data: PartsOverviewResponse) {
  return { data } as unknown as Awaited<ReturnType<typeof getPartsOverview>>;
}

describe('PartsPage (Unified RollerCoin-style Merge)', () => {
  it('renders workbench with candidate, parts, and rarity tree', async () => {
    mockedGet.mockResolvedValue(
      resolvedOverview({
        ok: true,
        blkBalance: 1.0,
        parts: [
          { slug: 'power_cable', rarity: 'common', imageUrl: '/media/parts/power_cable.png', quantity: 4 },
        ],
        machines: [],
        ownedMergeCandidates: [testCandidate],
      }),
    );

    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Merge' })).toBeInTheDocument();
    expect(screen.getByText('Bancada de Fusão')).toBeInTheDocument();
    expect(screen.getByText('Suas Peças')).toBeInTheDocument();
    expect(screen.getByText('1 pronta para fundir')).toBeInTheDocument();
    expect(screen.getAllByText(/Quantum Forge/i)[0]).toBeInTheDocument();
    expect(screen.getByText('Tabela de Raridades & Bônus')).toBeInTheDocument();
  });

  it('handles empty owned machines gracefully', async () => {
    mockedGet.mockResolvedValue(
      resolvedOverview({
        ok: true,
        blkBalance: 0.5,
        parts: [],
        machines: [],
        ownedMergeCandidates: [],
      }),
    );

    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Merge' })).toBeInTheDocument();
    expect(screen.getByText('0 modelos')).toBeInTheDocument();
  });

  it('plays the forge overlay and reveals the merged machine only after the server confirms', async () => {
    const overview = resolvedOverview({
      ok: true,
      blkBalance: 1,
      parts: [],
      machines: [],
      ownedMergeCandidates: [testCandidate],
    });
    mockedGet.mockResolvedValue(overview);
    let resolveMerge: (v: unknown) => void = () => {};
    mockedMerge.mockReturnValue(
      new Promise((r) => {
        resolveMerge = r;
      }) as unknown as ReturnType<typeof mergeMachine>,
    );

    renderPage();
    const forge = await screen.findByRole('button', { name: /Fundir pagando/ });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(forge);

    const overlay = await screen.findByTestId('merge-forge-overlay');
    expect(overlay).toHaveAttribute('data-stage', 'charge');
    expect(mockedMerge).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(screen.getByTestId('merge-forge-overlay')).toHaveAttribute('data-stage', 'charge');

    await act(async () => {
      resolveMerge({ data: { ok: true, name: 'Quantum Forge (Incomum)' } });
      await vi.advanceTimersByTimeAsync(1000);
    });
    await waitFor(() => expect(screen.getByTestId('merge-forge-overlay')).toHaveAttribute('data-stage', 'reveal'));
    expect(screen.getAllByText('Quantum Forge (Incomum)').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.queryByTestId('merge-forge-overlay')).not.toBeInTheDocument();
  });

  it('closes the forge overlay and shows the error when the merge fails', async () => {
    mockedGet.mockResolvedValue(
      resolvedOverview({ ok: true, blkBalance: 1, parts: [], machines: [], ownedMergeCandidates: [testCandidate] }),
    );
    mockedMerge.mockRejectedValue(new Error('boom'));

    renderPage();
    const forge = await screen.findByRole('button', { name: /Fundir pagando/ });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(forge);
    expect(await screen.findByTestId('merge-forge-overlay')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await waitFor(() => expect(screen.queryByTestId('merge-forge-overlay')).not.toBeInTheDocument());
  });

  it('mostra o guia de peças grátis com as taxas que o servidor mandou', async () => {
    mockedGet.mockResolvedValue(
      resolvedOverview({
        ok: true,
        blkBalance: 1,
        parts: [],
        machines: [],
        ownedMergeCandidates: [],
        dropRates: { activityBps: 2000, frequentActivityBps: 500, offerwallMicroBps: 4000 },
      }),
    );
    renderPage();
    const faucet = await screen.findByTestId('free-parts-source-faucet');
    await waitFor(() => expect(faucet).toHaveTextContent('20% de chance por claim'));
    expect(screen.getByTestId('free-parts-source-automining')).toHaveTextContent('5% de chance por claim');
  });
});
