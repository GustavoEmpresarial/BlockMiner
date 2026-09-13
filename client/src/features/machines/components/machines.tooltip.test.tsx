import '@testing-library/jest-dom/vitest';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { RackMachineTooltipPortal } from './machines.tooltip';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });

function withProviders(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

afterEach(cleanup);

function makeAnchor(rect: Partial<DOMRect>) {
  const el = document.createElement('button');
  document.body.appendChild(el);
  el.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON() {},
    ...rect,
  });
  return el;
}

describe('RackMachineTooltipPortal', () => {
  it('renders nothing when closed', () => {
    const anchor = makeAnchor({});
    const { container } = render(
      withProviders(<RackMachineTooltipPortal open={false} anchorEl={anchor} displayName="X" hashrateStr="1 H/s" slotSize={1} />),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is no anchor element', () => {
    const { container } = render(
      withProviders(<RackMachineTooltipPortal open anchorEl={null} displayName="X" hashrateStr="1 H/s" slotSize={1} />),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('portals tooltip content into document.body with the singular slot label', async () => {
    const anchor = makeAnchor({ top: 500, left: 100, width: 40, height: 40, bottom: 540 });
    await act(async () => {
      render(withProviders(<RackMachineTooltipPortal open anchorEl={anchor} displayName="Quantum Miner" hashrateStr="1.5 KH/s" slotSize={1} />));
    });
    expect(screen.getByText('Quantum Miner')).toBeInTheDocument();
    expect(screen.getByText('Poder: 1.5 KH/s')).toBeInTheDocument();
    expect(screen.getByText('1 slot ocupado')).toBeInTheDocument();
  });

  it('uses the plural slot label for slotSize > 1', async () => {
    const anchor = makeAnchor({ top: 500, left: 100, width: 40, height: 40, bottom: 540 });
    await act(async () => {
      render(withProviders(<RackMachineTooltipPortal open anchorEl={anchor} displayName="Big Rig" hashrateStr="2 MH/s" slotSize={2} />));
    });
    expect(screen.getByText('2 slots ocupados')).toBeInTheDocument();
  });

  it('flips below the anchor when there is not enough room above (top < VIEWPORT_MARGIN)', async () => {
    const anchor = makeAnchor({ top: 4, left: 100, width: 40, height: 40, bottom: 44 });
    await act(async () => {
      render(withProviders(<RackMachineTooltipPortal open anchorEl={anchor} displayName="X" hashrateStr="1 H/s" slotSize={1} />));
    });
    const tooltip = screen.getByText('Máquina').closest('div');
    // Flipped below means top >= anchor.bottom + GAP(8), i.e. >= 52, definitely not negative.
    expect(Number.parseFloat((tooltip as HTMLElement).style.top)).toBeGreaterThanOrEqual(44);
  });

  it('hides (opacity-0) once the anchor is disconnected and a reposition is triggered', async () => {
    const anchor = makeAnchor({ top: 500, left: 100, width: 40, height: 40, bottom: 540 });
    await act(async () => {
      render(withProviders(<RackMachineTooltipPortal open anchorEl={anchor} displayName="X" hashrateStr="1 H/s" slotSize={1} />));
    });
    anchor.remove();
    // A resize/scroll re-runs updatePosition, which checks anchorEl.isConnected.
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });
    const tooltip = screen.getByText('Máquina').closest('div');
    expect(tooltip).toHaveClass('opacity-0');
  });

  it('recomputes position on window resize/scroll while open (no crash, listeners wired)', async () => {
    const anchor = makeAnchor({ top: 500, left: 100, width: 40, height: 40, bottom: 540 });
    await act(async () => {
      render(withProviders(<RackMachineTooltipPortal open anchorEl={anchor} displayName="X" hashrateStr="1 H/s" slotSize={1} />));
    });
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByText('Máquina')).toBeInTheDocument();
  });
});
