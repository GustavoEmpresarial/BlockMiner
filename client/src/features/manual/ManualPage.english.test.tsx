import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';
vi.mock('../parts/lib/parts.api', () => ({
  getPartsOverview: vi.fn(async () => ({ data: { ok: true, blkBalance: 0, parts: [], machines: [], ownedMergeCandidates: [] } })),
  mergeMachine: vi.fn(),
  craftPart: vi.fn(),
}));

import ManualPage from './ManualPage';
import PartsPage from '../parts/PartsPage';

/** Portuguese-only characters/words that must not leak into an English or Spanish screen. */
// "máquinas" is also Spanish, so only words that exist in Portuguese alone are listed.
const PT_LEAK = /[ãõç]|\b(você|não|peças?|carteira|saque|mineração|fusão)\b/i;

async function renderIn(lng: 'en' | 'es', ui: React.ReactElement) {
  const i18n = i18next.createInstance();
  await i18n.init({ lng, resources: { [lng]: { translation: lng === 'en' ? en : es } }, interpolation: { escapeValue: false } });
  return render(
    <MemoryRouter>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </MemoryRouter>,
  );
}

describe('Manual and Merge in other languages', () => {
  it.each(['en', 'es'] as const)('Manual has no Portuguese text in %s', async (lng) => {
    const { container } = await renderIn(lng, <ManualPage />);
    const text = container.textContent ?? '';
    expect(text).toContain(lng === 'en' ? en.manual.cover_title : es.manual.cover_title);
    expect(text.match(PT_LEAK)?.[0] ?? null).toBeNull();
  });

  it('Merge page headings are translated in en', async () => {
    const { findByText } = await renderIn('en', <PartsPage />);
    expect(await findByText(en.parts.page.bag_title)).toBeInTheDocument();
  });
});
