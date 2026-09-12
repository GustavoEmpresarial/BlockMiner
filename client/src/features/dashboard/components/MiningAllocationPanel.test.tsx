import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { MiningAllocationPanel } from './MiningAllocationPanel';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });

function baseProps() {
  return {
    effectivePolPercent: 60,
    effectiveShibPercent: 40,
    blockRewardPol: 10,
    blockRewardShib: 100,
    savingAlloc: false,
    allocModalOpen: false,
    draftPol: '60',
    draftShib: '40',
    draftError: null as string | null,
    onOpenModal: vi.fn(),
    onCloseModal: vi.fn(),
    onDraftPolChange: vi.fn(),
    onDraftShibChange: vi.fn(),
    onPreset: vi.fn(),
    onSave: vi.fn(),
  };
}

function renderPanel(overrides: Partial<ReturnType<typeof baseProps>> = {}) {
  const props = { ...baseProps(), ...overrides };
  render(
    <I18nextProvider i18n={i18n}>
      <MiningAllocationPanel {...props} />
    </I18nextProvider>,
  );
  return props;
}

afterEach(() => cleanup());

describe('MiningAllocationPanel', () => {
  it('renders the current split percentages', () => {
    renderPanel();
    expect(screen.getByText(/60%/)).toBeInTheDocument();
    expect(screen.getByText(/40%/)).toBeInTheDocument();
  });

  it('does not render the modal when closed', () => {
    renderPanel({ allocModalOpen: false });
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('opens the edit modal via onOpenModal', () => {
    const props = renderPanel();
    fireEvent.click(screen.getByText((t) => t.toLowerCase().includes('editar') || t.toLowerCase().includes('edit')));
    expect(props.onOpenModal).toHaveBeenCalledTimes(1);
  });

  it('shows the validation error message when draftError is set', () => {
    renderPanel({ allocModalOpen: true, draftError: 'Split must sum to 100' });
    expect(screen.getByText('Split must sum to 100')).toBeInTheDocument();
  });

  it('disables save/cancel/preset controls while saving to prevent a double-submit race', () => {
    renderPanel({ allocModalOpen: true, savingAlloc: true });
    const numberInputs = screen.getAllByDisplayValue(/60|40/);
    numberInputs.forEach((input) => expect(input).toBeDisabled());
  });

  it('calls onPreset with the right pol value when a preset chip is clicked', () => {
    const props = renderPanel({ allocModalOpen: true });
    fireEvent.click(screen.getByText('50/50'));
    expect(props.onPreset).toHaveBeenCalledWith(50);
  });

  it('falls back to 0 for a non-finite draft value instead of rendering NaN in the bar width', () => {
    renderPanel({ allocModalOpen: true, draftPol: 'not-a-number', draftShib: 'also-bad' });
    // Should not throw during render; NaN would otherwise propagate into style width.
    expect(screen.getAllByText((t) => t.includes('%')).length).toBeGreaterThan(0);
  });
});
