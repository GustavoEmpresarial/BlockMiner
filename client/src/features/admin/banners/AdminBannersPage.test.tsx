import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminBanners from './AdminBannersPage';

const mockListAdminBanners = vi.fn();
const mockCreateAdminBanner = vi.fn();
const mockUpdateAdminBanner = vi.fn();
const mockToggleAdminBanner = vi.fn();
const mockDeleteAdminBanner = vi.fn();
const mockUploadBannerMedia = vi.fn();

vi.mock('./banners.api', () => ({
  listAdminBanners: () => mockListAdminBanners(),
  createAdminBanner: (body: unknown) => mockCreateAdminBanner(body),
  updateAdminBanner: (id: number, body: unknown) => mockUpdateAdminBanner(id, body),
  toggleAdminBanner: (id: number, isActive: boolean) => mockToggleAdminBanner(id, isActive),
  deleteAdminBanner: (id: number) => mockDeleteAdminBanner(id),
  uploadBannerMedia: (file: File) => mockUploadBannerMedia(file),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('AdminBannersPage — UI do Painel Administrativo de Banners', () => {
  it('renderiza o cabeçalho e estado vazio quando não há banners', async () => {
    mockListAdminBanners.mockResolvedValueOnce([]);

    render(<AdminBanners />);

    expect(screen.getByText('Banners do Dashboard')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Nenhum banner cadastrado')).toBeInTheDocument();
    });
  });

  it('renderiza a lista de banners cadastrados com badges e links', async () => {
    const banners = [
      {
        id: 1,
        title: 'Super Promoção',
        message: 'Aproveite o bônus de mineração',
        type: 'promo',
        link: '/shop',
        linkLabel: 'Ver Loja',
        isActive: true,
      },
      {
        id: 2,
        title: 'Manutenção Preventiva',
        message: 'Servidores serão reiniciados',
        type: 'warning',
        isActive: false,
      },
    ];
    mockListAdminBanners.mockResolvedValueOnce(banners);

    render(<AdminBanners />);

    await waitFor(() => {
      expect(screen.getByText('Super Promoção')).toBeInTheDocument();
      expect(screen.getByText('Manutenção Preventiva')).toBeInTheDocument();
      expect(screen.getByText('2 banner(s) cadastrado(s)')).toBeInTheDocument();
    });

    expect(screen.getByText('Promo')).toBeInTheDocument();
    expect(screen.getByText('Aviso')).toBeInTheDocument();
  });

  it('abre o formulário ao clicar em "Novo Banner" e cria um banner com sucesso', async () => {
    mockListAdminBanners.mockResolvedValueOnce([]);
    mockCreateAdminBanner.mockResolvedValueOnce({ ok: true, banner: { id: 3, title: 'Novo' } });

    render(<AdminBanners />);

    await waitFor(() => {
      expect(screen.getByText('Nenhum banner cadastrado')).toBeInTheDocument();
    });

    const newBtn = screen.getByRole('button', { name: /novo banner/i });
    await userEvent.click(newBtn);

    const titleInput = screen.getByPlaceholderText('Título do banner');
    await userEvent.type(titleInput, 'Meu Banner Novo');

    mockListAdminBanners.mockResolvedValueOnce([
      { id: 3, title: 'Meu Banner Novo', type: 'promo', isActive: true },
    ]);

    const saveBtn = screen.getByRole('button', { name: /salvar/i });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockCreateAdminBanner).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Meu Banner Novo' }),
      );
    });
  });

  it('permite alternar status ativo/inativo ao clicar no botão de toggle', async () => {
    const banner = {
      id: 10,
      title: 'Banner Teste Toggle',
      type: 'info',
      isActive: true,
    };
    mockListAdminBanners.mockResolvedValueOnce([banner]);
    mockToggleAdminBanner.mockResolvedValueOnce(true);
    mockListAdminBanners.mockResolvedValueOnce([{ ...banner, isActive: false }]);

    render(<AdminBanners />);

    await waitFor(() => {
      expect(screen.getByText('Banner Teste Toggle')).toBeInTheDocument();
    });

    const toggleBtn = screen.getByRole('button', { name: /desativar banner/i });
    await userEvent.click(toggleBtn);

    await waitFor(() => {
      expect(mockToggleAdminBanner).toHaveBeenCalledWith(10, false);
    });
  });

  it('exibe confirmação inline e deleta o banner ao confirmar', async () => {
    const banner = {
      id: 15,
      title: 'Banner Para Deletar',
      type: 'info',
      isActive: true,
    };
    mockListAdminBanners.mockResolvedValueOnce([banner]);
    mockDeleteAdminBanner.mockResolvedValueOnce(true);
    mockListAdminBanners.mockResolvedValueOnce([]);

    render(<AdminBanners />);

    await waitFor(() => {
      expect(screen.getByText('Banner Para Deletar')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole('button', { name: /excluir banner/i });
    await userEvent.click(deleteBtn);

    expect(screen.getByText('Excluir?')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: 'Sim' });
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockDeleteAdminBanner).toHaveBeenCalledWith(15);
    });
  });
});
