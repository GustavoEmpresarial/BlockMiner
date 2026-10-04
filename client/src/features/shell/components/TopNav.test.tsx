import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TopNav from './TopNav';

// Mock auth store
const mockLogout = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../shared/auth/auth.store', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { ok: true } }),
    post: vi.fn().mockResolvedValue({ data: { ok: true } }),
  },
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      user: {
        id: 1,
        name: 'TesterMiner',
        username: 'TesterMiner',
        email: 'tester@blockminer.space',
      },
      logout: mockLogout,
    }),
}));

vi.mock('../../offers/lib/offers.api', () => ({
  getActiveOfferEvents: vi.fn().mockResolvedValue({ data: [] }),
  isActiveOffersPayloadLive: vi.fn().mockReturnValue(false),
}));

vi.mock('../lib/game.store', () => ({
  useGameStore: (selector: (s: unknown) => unknown) =>
    selector({
      toggleChat: vi.fn(),
      hasMention: false,
      notifications: [
        { id: 1, title: 'Bônus Coletado', message: 'Você recebeu 0.5 POL', isRead: false },
      ],
      markNotificationRead: vi.fn(),
      fetchNotifications: vi.fn().mockResolvedValue(undefined),
    }),
}));

vi.mock('../../ptc/lib/ptcSession.store', () => ({
  usePtcSessionStore: () => null,
}));

vi.mock('../../offerwall/lib/offerwallTimer.store', () => ({
  useOfferwallTimerStore: () => false,
}));

describe('TopNav Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  const renderTopNav = (initialPath = '/dashboard') => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <TopNav />
      </MemoryRouter>,
    );
  };

  it('renders logo, navigation groups, balance pill, avatar, and logout button', () => {
    renderTopNav();

    // Brand logo
    expect(screen.getByLabelText('BlockMiner Home')).toBeInTheDocument();

    // 4 Top-level groups
    expect(screen.getByRole('button', { name: /(sidebar\.categories\.main|Principal)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /(sidebar\.categories\.earn|Ganhar)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /(sidebar\.shop|Loja)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /(sidebar\.categories\.social|Social & Fun)/i })).toBeInTheDocument();

    // Avatar
    expect(screen.getByLabelText(/Definições do perfil de TesterMiner/i)).toBeInTheDocument();

    // Logout button (Sair da Conta / common.logout)
    const logoutBtns = screen.getAllByRole('button', { name: /(common\.logout|sidebar\.logout|Sair da Conta|Logout)/i });
    expect(logoutBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('opens dropdown menu on click, focuses submenu item, and closes on Escape returning focus to trigger', async () => {
    const user = userEvent.setup();
    renderTopNav();

    const miningGroupBtn = screen.getByRole('button', { name: /(sidebar\.categories\.main|Principal)/i });
    expect(miningGroupBtn).toHaveAttribute('aria-expanded', 'false');

    // Click to open
    await user.click(miningGroupBtn);
    expect(miningGroupBtn).toHaveAttribute('aria-expanded', 'true');

    // Submenu items appear (e.g. Dashboard Central)
    const dashboardItem = screen.getByRole('menuitem', { name: /(sidebar\.dashboard|Dashboard)/i });
    expect(dashboardItem).toBeInTheDocument();

    // Explicitly focus the submenu child item (moving focus away from the trigger)
    dashboardItem.focus();
    expect(dashboardItem).toHaveFocus();
    expect(miningGroupBtn).not.toHaveFocus();

    // Press Escape while focused on the child item
    fireEvent.keyDown(dashboardItem, { key: 'Escape' });

    // Menu must be closed and focus MUST have returned to the trigger button
    expect(miningGroupBtn).toHaveAttribute('aria-expanded', 'false');
    expect(miningGroupBtn).toHaveFocus();
    expect(dashboardItem).not.toHaveFocus();
  });

  it('opens mobile navigation drawer via hamburger button and closes with close button', async () => {
    const user = userEvent.setup();
    renderTopNav();

    const hamburgerBtn = screen.getByLabelText('Abrir menu de navegação completo');
    await user.click(hamburgerBtn);

    // Dialog appears in portal
    const dialog = screen.getByRole('dialog', { name: 'Menu de Navegação Mobile' });
    expect(dialog).toBeInTheDocument();

    // Close button
    const closeBtn = screen.getByLabelText('Fechar menu');
    await user.click(closeBtn);
    expect(dialog).not.toBeInTheDocument();
  });

  it('renders mobile ergonomic bottom nav with 5 thumb action destinations', () => {
    renderTopNav();

    const bottomNav = screen.getByLabelText('Navegação Rápida Inferior');
    expect(bottomNav).toBeInTheDocument();

    // Scoped strictly within bottomNav (preventing leaks from header links)
    const links = within(bottomNav).getAllByRole('link');
    const bottomNavHrefs = links.map((l) => l.getAttribute('href'));

    expect(bottomNavHrefs).toEqual(['/dashboard', '/inventory', '/tasks', '/shop', '/wallet']);
  });

  it('calls logout when the logout button is clicked', async () => {
    const user = userEvent.setup();
    renderTopNav();

    const logoutBtns = screen.getAllByRole('button', { name: /Sair da Conta/i });
    await user.click(logoutBtns[0]);

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
