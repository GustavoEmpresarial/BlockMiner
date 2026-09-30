import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminUserSidebarPage from './AdminUserSidebarPage';
import { toast } from 'sonner';

const mockGetNavConfig = vi.fn();
const mockUpdateNavConfig = vi.fn();

vi.mock('./adminSidebarNav.api', () => ({
  adminSidebarNavApi: {
    getNavConfig: () => mockGetNavConfig(),
    updateNavConfig: (entries: unknown) => mockUpdateNavConfig(entries),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const sampleEntries = [
  { itemId: 'dashboard', visible: true, sortOrder: 10, section: 'main', parentItemId: null },
  { itemId: 'power_stats', visible: true, sortOrder: 20, section: 'main', parentItemId: null },
  { itemId: 'machines', visible: false, sortOrder: 30, section: 'main', parentItemId: null },
  { itemId: 'rewards_group', visible: true, sortOrder: 100, section: 'earn', parentItemId: null },
  { itemId: 'faucet', visible: true, sortOrder: 110, section: 'earn', parentItemId: 'rewards_group' },
  { itemId: 'zerads', visible: false, sortOrder: 120, section: 'earn', parentItemId: 'rewards_group' },
  { itemId: 'ranking', visible: true, sortOrder: 200, section: 'social', parentItemId: null },
];

const sampleItemMeta = {
  dashboard: { labelKey: 'sidebar.dashboard', icon: 'LayoutDashboard', section: 'main', parentLocked: true, defaultParentItemId: null, isGroup: false },
  power_stats: { labelKey: 'sidebar.power_stats', icon: 'BarChart3', section: 'main', parentLocked: true, defaultParentItemId: null, isGroup: false },
  machines: { labelKey: 'sidebar.machines', icon: 'Cpu', section: 'main', parentLocked: true, defaultParentItemId: null, isGroup: false },
  rewards_group: { labelKey: 'sidebar.rewards', icon: 'Folder', section: 'earn', parentLocked: true, defaultParentItemId: null, isGroup: true },
  faucet: { labelKey: 'sidebar.faucet', icon: 'Gift', section: 'earn', parentLocked: false, defaultParentItemId: 'rewards_group', isGroup: false },
  zerads: { labelKey: 'sidebar.zerads', icon: 'MousePointerClick', section: 'earn', parentLocked: false, defaultParentItemId: 'rewards_group', isGroup: false },
  ranking: { labelKey: 'sidebar.ranking', icon: 'Trophy', section: 'social', parentLocked: true, defaultParentItemId: null, isGroup: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetNavConfig.mockResolvedValue({
    data: {
      ok: true,
      entries: sampleEntries,
      categories: [],
      itemMeta: sampleItemMeta,
    },
  });
  mockUpdateNavConfig.mockResolvedValue({
    data: {
      ok: true,
      entries: sampleEntries,
      categories: [],
    },
  });
});

afterEach(() => {
  cleanup();
});

describe('AdminUserSidebarPage — Gestão da Sidebar do Usuário', () => {
  it('renderiza o cabeçalho, KPIs e seções após carregar dados', async () => {
    render(<AdminUserSidebarPage />);

    await waitFor(() => {
      expect(screen.getByText(/Sidebar do App/i)).toBeInTheDocument();
      expect(screen.getByText('Total de Itens')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument(); // total items
      expect(screen.getByText('Seção Principal')).toBeInTheDocument();
      expect(screen.getByText('Seção Ganhar & Recompensas')).toBeInTheDocument();
      expect(screen.getByText('Seção Social, Comunidade & Governança')).toBeInTheDocument();
    });
  });

  it('permite alternar visibilidade de um item e habilita o botão de salvar', async () => {
    const user = userEvent.setup();
    render(<AdminUserSidebarPage />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: /Salvar Alterações/i });
    expect(saveButton).toBeDisabled();

    // Toggle Dashboard visibility
    const visibleButtons = screen.getAllByRole('button', { name: /Visível/i });
    await user.click(visibleButtons[0]);

    // Save button should now be enabled (dirty state)
    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
      expect(screen.getByText(/Alterações pendentes de salvamento/i)).toBeInTheDocument();
    });

    // Save changes
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateNavConfig).toHaveBeenCalledTimes(1);
      expect(toast.success).toHaveBeenCalledWith('Configuração da sidebar atualizada com sucesso!');
    });
  });

  it('bloqueia alternância de visibilidade do ZerAds por ser embutido', async () => {
    render(<AdminUserSidebarPage />);

    await waitFor(() => {
      expect(screen.getByText('ZerAds (Embutido)')).toBeInTheDocument();
    });

    const zeradsButton = screen.getByTitle(/ZerAds é permanentemente desativado/i);
    expect(zeradsButton).toBeDisabled();
  });

  it('filtra itens corretamente pelo campo de busca', async () => {
    const user = userEvent.setup();
    render(<AdminUserSidebarPage />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Classificação Geral')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Buscar item ou módulo/i);
    await user.type(searchInput, 'ranking');

    await waitFor(() => {
      expect(screen.getByText('Classificação Geral')).toBeInTheDocument();
      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    });
  });

  it('permite alternar entre o modo visual e o editor JSON avançado', async () => {
    const user = userEvent.setup();
    render(<AdminUserSidebarPage />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    const jsonModeButton = screen.getByRole('button', { name: /JSON Avançado/i });
    await user.click(jsonModeButton);

    await waitFor(() => {
      expect(screen.getByText('Editor JSON Bruto')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    const visualModeButton = screen.getByRole('button', { name: /Visual/i });
    await user.click(visualModeButton);

    await waitFor(() => {
      expect(screen.getByText('Seção Principal')).toBeInTheDocument();
    });
  });

  it('permite descartar alterações locais restaurando do servidor', async () => {
    const user = userEvent.setup();
    render(<AdminUserSidebarPage />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    const discardButton = screen.getByRole('button', { name: /Descartar/i });
    expect(discardButton).toBeDisabled();

    // Change an item to make dirty
    const visibleButtons = screen.getAllByRole('button', { name: /Visível/i });
    await user.click(visibleButtons[0]);

    await waitFor(() => {
      expect(discardButton).not.toBeDisabled();
    });

    await user.click(discardButton);

    await waitFor(() => {
      expect(mockGetNavConfig).toHaveBeenCalledTimes(2);
    });
  });
});
