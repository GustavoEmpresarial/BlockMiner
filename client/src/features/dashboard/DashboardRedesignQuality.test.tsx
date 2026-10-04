import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import esTranslations from '../../i18n/locales/es.json';
import ptBRTranslations from '../../i18n/locales/pt-BR.json';
import { api } from '../../shared/auth/auth.store';
import { DashboardHistory } from './components/dashboard.parts';

// Mock auth.store with mocked api client
vi.mock('../../shared/auth/auth.store', () => {
  const get = vi.fn();
  const post = vi.fn();
  const patch = vi.fn();
  return {
    api: { get, post, patch },
    useAuthStore: (selector: (s: unknown) => unknown) =>
      selector({
        user: { id: 101, name: 'Satoshi', refCode: 'SAT101' },
        checkSession: vi.fn(),
      }),
  };
});

vi.mock('../shell/lib/game.store', () => ({
  useGameStore: (selector: (s: unknown) => unknown) =>
    selector({
      stats: null,
      initSocket: vi.fn(),
      socket: null,
    }),
}));

function setupHappyApiMock() {
  (api.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
    if (url === '/mining/cycle') {
      return {
        data: {
          ok: true,
          blockReward: 10,
          blockRewardShib: 100,
          blockIntervalMinutes: 10,
          blockCountdownSeconds: 300,
          networkHashRate: 1000,
          tokenSymbol: 'BLK',
          blockHistory: [],
          miner: { estimatedHashRate: 100, miningAllocationPolBps: 10000, referralCount: 2 },
        },
      };
    }
    if (url === '/wallet/balance') {
      return { data: { ok: true, balance: 1.23, blkBalance: 4, shibBalance: 5, polBalance: 1.23 } };
    }
    if (url === '/rooms/slots') {
      return { data: { ok: true, freeRacks: 2, inventoryCount: 3 } };
    }
    if (url === '/wallet/withdraw-fee-info') {
      return {
        data: {
          ok: true,
          completionsToday: 3,
          requiredForWaiver: 10,
          feeWaived: false,
          feeAlreadyChargedToday: false,
        },
      };
    }
    if (url === '/banners') {
      return { data: { ok: true, banners: [] } };
    }
    if (url === '/energy-tax/summary') {
      return { data: { ok: true, active: false } };
    }
    return { data: { ok: true } };
  });
}

const testI18n = i18next.createInstance();

beforeEach(async () => {
  setupHappyApiMock();
  await testI18n.init({
    lng: 'pt-BR',
    resources: {
      'pt-BR': { translation: ptBRTranslations },
      es: { translation: esTranslations },
    },
    interpolation: { escapeValue: false },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function mountDashboard(lng = 'pt-BR') {
  await testI18n.changeLanguage(lng);
  const { default: DashboardPage } = await import('./DashboardPage');
  return render(
    <I18nextProvider i18n={testI18n}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('Dashboard Redesign Quality & Requirements', () => {
  describe('P1: Badge de sincronização reativo ao estado real', () => {
    it('renderiza o badge com role="status", aria-live="polite" e estado sincronizado no fluxo online', async () => {
      await mountDashboard();
      await waitFor(() => {
        expect(screen.getByText(/Satoshi/)).toBeInTheDocument();
      });

      const badge = screen.getByTestId('sync-status-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute('role', 'status');
      expect(badge).toHaveAttribute('aria-live', 'polite');
      expect(badge).toHaveTextContent(/Sincronizado/i);
    });

    it('atualiza o badge imediatamente para offline quando o navegador perde conexão', async () => {
      await mountDashboard();
      await waitFor(() => {
        expect(screen.getByTestId('sync-status-badge')).toBeInTheDocument();
      });

      act(() => {
        window.dispatchEvent(new Event('offline'));
      });

      await waitFor(() => {
        const badge = screen.getByTestId('sync-status-badge');
        expect(badge).toHaveTextContent(/Offline|Sin conexión/i);
      });
    });
  });

  describe('P2: Localização genuína em Espanhol (es.json)', () => {
    it('traduz prosa de welcome, balance, speed, next_block e histórico para espanhol autêntico', () => {
      const esDash = esTranslations.dashboard;
      expect(esDash.welcome).not.toContain('Welcome');
      expect(esDash.welcome).toMatch(/Bienvenido/i);
      expect(esDash.balance).not.toBe('Your Balance');
      expect(esDash.balance).toMatch(/Saldo/i);
      expect(esDash.speed).not.toBe('Your Speed');
      expect(esDash.speed).toMatch(/Velocidad/i);
      expect(esDash.network_power).not.toBe('Network Power');
      expect(esDash.network_power).toMatch(/Potencia/i);
      expect(esDash.next_block).not.toBe('Next Block');
      expect(esDash.next_block).toMatch(/Próximo Bloque/i);
      expect(esDash.history_title).not.toBe('Mining History');
      expect(esDash.history_title).toMatch(/Historial/i);
      expect(esDash.last_blocks).not.toBe('Last 5 Blocks');
      expect(esDash.block_id).not.toBe('Block ID');
      expect(esDash.distributed).not.toBe('Distributed');
    });
  });

  describe('P3: Eliminação da armadilha de containing block na raiz', () => {
    it('garante que o container raiz de DashboardPage não possui animate-in/fade-in', async () => {
      const { container } = await mountDashboard();
      await waitFor(() => {
        expect(screen.getByText(/Satoshi/)).toBeInTheDocument();
      });
      const rootDiv = container.firstElementChild as HTMLElement;
      expect(rootDiv).toBeInTheDocument();
      expect(rootDiv.className).not.toContain('animate-in');
      expect(rootDiv.className).not.toContain('fade-in');
    });
  });

  describe('P4 e P5: Consistência visual, raios e acessibilidade de tabelas', () => {
    it('garante que o card de afiliados não usa classe avulsa rounded-[2rem]', async () => {
      const { container } = await mountDashboard();
      await waitFor(() => {
        expect(screen.getByText(/Satoshi/)).toBeInTheDocument();
      });
      expect(container.querySelector('.rounded-\\[2rem\\]')).toBeNull();
    });

    it('adiciona scope="col" em todos os cabeçalhos <th> da tabela de histórico de blocos', () => {
      render(
        <I18nextProvider i18n={testI18n}>
          <MemoryRouter>
            <DashboardHistory blockHistory={[]} />
          </MemoryRouter>
        </I18nextProvider>,
      );
      const ths = screen.getAllByRole('columnheader');
      expect(ths.length).toBe(4);
      ths.forEach((th) => {
        expect(th).toHaveAttribute('scope', 'col');
      });
    });
  });
});
