/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../i18n/locales/pt-BR.json';
import EmailVerifyBanner from './EmailVerifyBanner';

const { api, session } = vi.hoisted(() => ({
  api: { post: vi.fn() },
  session: { emailVerified: false as boolean | undefined },
}));

vi.mock('../../shared/auth/auth.store', () => ({
  api,
  useAuthStore: (selector: (s: { user: { emailVerified?: boolean } }) => unknown) =>
    selector({ user: { emailVerified: session.emailVerified } }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const i18n = i18next.createInstance();

function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <EmailVerifyBanner />
    </I18nextProvider>,
  );
}

beforeAll(async () => {
  await i18n.init({
    lng: 'pt-BR',
    resources: { 'pt-BR': { translation: ptBR } },
    interpolation: { escapeValue: false },
  });
});

beforeEach(() => {
  session.emailVerified = false;
  api.post.mockReset();
  api.post.mockResolvedValue({ data: { ok: true } });
});

afterEach(() => {
  cleanup();
});

describe('EmailVerifyBanner', () => {
  it('mostra o botão de reenvio só para conta não confirmada', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Reenviar e-mail' })).toBeInTheDocument();
    expect(screen.getByText('Confirme seu e-mail pra liberar saques e o chat.')).toBeInTheDocument();
  });

  it('não aparece quando o e-mail já está confirmado', () => {
    session.emailVerified = true;
    mount();
    expect(screen.queryByRole('button', { name: 'Reenviar e-mail' })).not.toBeInTheDocument();
  });

  it('reenvia o e-mail de confirmação', async () => {
    const { toast } = await import('sonner');
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar e-mail' }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/resend-verification');
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('E-mail reenviado! Confira sua caixa de entrada.');
    });
  });
});
