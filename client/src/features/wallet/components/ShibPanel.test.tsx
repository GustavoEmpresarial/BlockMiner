import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShibPanel } from './ShibPanel';
import { api } from '../../../shared/auth/auth.store';
import { toast } from 'sonner';

vi.mock('../../../shared/auth/auth.store', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'wallet.shib.min_amount') return `Valor mínimo: ${options?.amount} SHIB`;
      if (key === 'wallet.shib.request_withdraw') return 'Solicitar Saque';
      if (key === 'wallet.shib.withdraw_submitted') return 'Saque enviado com sucesso';
      return key;
    },
  }),
}));

describe('ShibPanel — Validação de valor mínimo de saque de SHIB', () => {
  const onRefresh = vi.fn();
  const MIN_SHIB = 50000;

  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ok: true, minShib: MIN_SHIB },
    });
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ok: true, message: 'Saque enviado' },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('desabilita o botão de saque se o valor for menor que o mínimo exigido', async () => {
    const user = userEvent.setup();
    render(<ShibPanel balance={500000} onRefresh={onRefresh} />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/wallet/shib/withdraw-min');
    });

    const amountInput = screen.getByRole('spinbutton');
    const addressInput = screen.getByPlaceholderText('0x...');
    const submitBtn = screen.getByRole('button', { name: /solicitar saque/i });

    // Preenche endereço mas valor abaixo do mínimo (10.000 < 50.000)
    await user.type(addressInput, '0x1234567890abcdef1234567890abcdef12345678');
    await user.type(amountInput, '10000');

    // Botão DEVE permanecer desabilitado devido ao valor mínimo
    expect(submitBtn).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('habilita o botão de saque quando o valor atinge ou supera o mínimo exigido', async () => {
    const user = userEvent.setup();
    render(<ShibPanel balance={500000} onRefresh={onRefresh} />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/wallet/shib/withdraw-min');
    });

    const amountInput = screen.getByRole('spinbutton');
    const addressInput = screen.getByPlaceholderText('0x...');
    const submitBtn = screen.getByRole('button', { name: /solicitar saque/i });

    await user.type(addressInput, '0x1234567890abcdef1234567890abcdef12345678');
    await user.type(amountInput, '60000');

    // Botão DEVE estar habilitado com valor >= mínimo
    expect(submitBtn).not.toBeDisabled();
  });

  it('bloqueia o envio na função handleWithdraw caso o valor seja menor que o mínimo e emite toast de erro', async () => {
    const user = userEvent.setup();
    render(<ShibPanel balance={500000} onRefresh={onRefresh} />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/wallet/shib/withdraw-min');
    });

    const amountInput = screen.getByRole('spinbutton');
    const addressInput = screen.getByPlaceholderText('0x...');
    const form = amountInput.closest('form')!;

    await user.type(addressInput, '0x1234567890abcdef1234567890abcdef12345678');
    await user.type(amountInput, '20000');

    // Dispara submit programaticamente
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    // Garante que o toast de erro do valor mínimo foi exibido e API de saque NÃO foi chamada
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Valor mínimo'));
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('executa a chamada de saque com sucesso quando o valor é válido', async () => {
    const user = userEvent.setup();
    render(<ShibPanel balance={500000} onRefresh={onRefresh} />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/wallet/shib/withdraw-min');
    });

    const amountInput = screen.getByRole('spinbutton');
    const addressInput = screen.getByPlaceholderText('0x...');
    const submitBtn = screen.getByRole('button', { name: /solicitar saque/i });

    await user.type(addressInput, '0x1234567890abcdef1234567890abcdef12345678');
    await user.type(amountInput, '100000');

    await user.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/wallet/shib/withdraw', {
        amount: 100000,
        address: '0x1234567890abcdef1234567890abcdef12345678',
      });
      expect(toast.success).toHaveBeenCalledWith('Saque enviado');
      expect(onRefresh).toHaveBeenCalled();
    });
  });
});
