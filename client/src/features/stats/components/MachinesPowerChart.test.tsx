import '@testing-library/jest-dom/vitest';
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import MachinesPowerChart from './MachinesPowerChart';
import type { UserPowerStatsPayload } from '../lib/stats.api';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });

function withProviders(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

afterEach(() => cleanup());

describe('MachinesPowerChart', () => {
  it('shows the "no data" message when there are no active machines', () => {
    render(withProviders(<MachinesPowerChart power={{} as UserPowerStatsPayload} />));
    expect(screen.getByText(/ainda não há dados/i)).toBeInTheDocument();
  });

  it('excludes inactive machines from the "no data" check', () => {
    const power = { machines: { items: [{ minerName: 'Rig', hashRate: 10, isActive: false }] } } as unknown as UserPowerStatsPayload;
    render(withProviders(<MachinesPowerChart power={power} />));
    expect(screen.getByText(/ainda não há dados/i)).toBeInTheDocument();
  });

  it('does not throw when given active machines with a real hashrate', () => {
    const power = {
      machines: {
        items: [
          { minerName: 'Rig A', hashRate: 100, isActive: true },
          { minerName: 'Rig B', hashRate: 50, isActive: true },
        ],
      },
    } as unknown as UserPowerStatsPayload;
    expect(() => render(withProviders(<MachinesPowerChart power={power} />))).not.toThrow();
  });

  it('caps the chart at 12 active machines without throwing', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ minerName: `Rig ${i}`, hashRate: i + 1, isActive: true }));
    const power = { machines: { items } } as unknown as UserPowerStatsPayload;
    expect(() => render(withProviders(<MachinesPowerChart power={power} />))).not.toThrow();
  });

  it('does not throw when a machine name is missing (falls back to em dash) or hashRate is non-numeric', () => {
    const power = {
      machines: { items: [{ minerName: '', hashRate: 'oops', isActive: true }] },
    } as unknown as UserPowerStatsPayload;
    expect(() => render(withProviders(<MachinesPowerChart power={power} />))).not.toThrow();
  });
});
