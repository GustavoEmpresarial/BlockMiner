import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { RackDismantleModal } from './machines.dismantleModal';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });

function withProviders(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

afterEach(cleanup);

describe('RackDismantleModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      withProviders(<RackDismantleModal open={false} onClose={vi.fn()} displayRackNumber={3} loading={false} onConfirm={vi.fn()} />),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the rack number and confirm button when open, not loading', () => {
    render(withProviders(<RackDismantleModal open onClose={vi.fn()} displayRackNumber={3} loading={false} onConfirm={vi.fn()} />));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Deseja desmontar o rack 3/i)).toBeInTheDocument();
  });

  it('shows a loading indicator and disables all actions while loading', () => {
    render(withProviders(<RackDismantleModal open onClose={vi.fn()} displayRackNumber={3} loading onConfirm={vi.fn()} />));
    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) expect(btn).toBeDisabled();
  });

  it('backdrop click calls onClose (not while loading)', () => {
    const onClose = vi.fn();
    render(withProviders(<RackDismantleModal open onClose={onClose} displayRackNumber={1} loading={false} onConfirm={vi.fn()} />));
    fireEvent.mouseDown(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking inside the dialog does not close it', () => {
    const onClose = vi.fn();
    render(withProviders(<RackDismantleModal open onClose={onClose} displayRackNumber={1} loading={false} onConfirm={vi.fn()} />));
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('confirm button calls onConfirm', () => {
    const onConfirm = vi.fn();
    render(withProviders(<RackDismantleModal open onClose={vi.fn()} displayRackNumber={1} loading={false} onConfirm={onConfirm} />));
    fireEvent.click(screen.getByText('Confirmar desmontagem'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('the X close button and the cancel text button both call onClose', () => {
    const onClose = vi.fn();
    render(withProviders(<RackDismantleModal open onClose={onClose} displayRackNumber={1} loading={false} onConfirm={vi.fn()} />));
    fireEvent.click(screen.getByLabelText('Cancelar'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
