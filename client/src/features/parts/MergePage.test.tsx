import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../i18n/locales/pt-BR.json';
import MergePage from './MergePage';
import { getPartsOverview, mergeMachine } from './lib/parts.api';
import type { PartsOverviewResponse, OwnedMergeCandidate } from './lib/parts.types';

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
  targetHashRate: 13,
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
        <MergePage />
      </I18nextProvider>
    </MemoryRouter>,
  );
}

function resolvedOverview(data: PartsOverviewResponse) {
  return { data } as unknown as Awaited<ReturnType<typeof getPartsOverview>>;
}

describe('MergePage (Compatibility alias to unified PartsPage)', () => {
  it('renders the unified forge and parts page correctly', async () => {
    mockedGet.mockResolvedValue(
      resolvedOverview({
        ok: true,
        blkBalance: 0.5,
        parts: [
          { slug: 'power_cable', rarity: 'common', imageUrl: '/media/parts/power_cable.png', quantity: 2 },
        ],
        machines: [],
        ownedMergeCandidates: [testCandidate],
      }),
    );

    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Merge' })).toBeInTheDocument();
    expect(screen.getByText('Bancada de Fusão')).toBeInTheDocument();
  });
});
