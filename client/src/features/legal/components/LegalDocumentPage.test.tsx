import '@testing-library/jest-dom/vitest';
import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { LegalDocumentPage } from './LegalDocumentPage';
import { COOKIE_POLICY_SECTION_IDS } from '../lib/legalSectionIds';

const i18n = i18next.createInstance();
beforeAll(async () => {
  await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });
});

afterEach(() => {
  cleanup();
});

function renderCookiePolicy() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <LegalDocumentPage
          canonicalPath="/cookie-policy"
          metaTitleKey="legal.cookiePolicy.meta.title"
          metaDescriptionKey="legal.cookiePolicy.meta.description"
          eyebrowKey="legal.cookiePolicy.eyebrow"
          titleKey="legal.cookiePolicy.title"
          introKey="legal.cookiePolicy.intro"
          sectionIds={COOKIE_POLICY_SECTION_IDS}
          sectionsTranslationPrefix="legal.cookiePolicy.sections"
        />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('LegalDocumentPage (Cookie Policy)', () => {
  it('renders every section as a heading with real, non-empty body text (no missing i18n keys)', () => {
    renderCookiePolicy();
    for (const id of COOKIE_POLICY_SECTION_IDS) {
      const heading = document.getElementById(`${id}-title`);
      expect(heading, `expected a heading for section "${id}"`).toBeTruthy();
      expect(heading!.textContent).not.toMatch(/^legal\.cookiePolicy\.sections\./); // raw key leaking = missing translation
      const section = document.getElementById(id);
      expect(section!.textContent!.length).toBeGreaterThan((heading!.textContent ?? '').length + 20);
    }
  });

  it('the mobile TOC (<details>) and desktop TOC (<nav>) both list every section, and stay mutually exclusive by viewport class', () => {
    renderCookiePolicy();
    const details = document.querySelector('details');
    expect(details).toBeTruthy();
    expect(details!.className).toMatch(/lg:hidden/);
    const mobileLinks = within(details as HTMLElement).getAllByRole('link');
    expect(mobileLinks).toHaveLength(COOKIE_POLICY_SECTION_IDS.length);

    const desktopNav = screen.getAllByRole('navigation').find((n) => n !== details!.querySelector('nav'));
    expect(desktopNav?.className).toMatch(/hidden lg:block|lg:block/);
    const desktopLinks = within(desktopNav as HTMLElement).getAllByRole('link');
    expect(desktopLinks).toHaveLength(COOKIE_POLICY_SECTION_IDS.length);

    // Every TOC link (both copies) must resolve to a real in-page anchor.
    for (const link of [...mobileLinks, ...desktopLinks]) {
      const href = link.getAttribute('href') ?? '';
      expect(href.startsWith('#')).toBe(true);
      expect(document.getElementById(href.slice(1)), `no element for anchor ${href}`).toBeTruthy();
    }
  });

  it('the bottom cross-link row excludes the current page and links to the other two policies', () => {
    renderCookiePolicy();
    expect(screen.queryByRole('link', { name: 'Ler Política de Cookies' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ler Termos de Uso' })).toHaveAttribute('href', '/terms-of-use');
    expect(screen.getByRole('link', { name: 'Ler Política de Privacidade' })).toHaveAttribute('href', '/privacy-policy');
  });

  it('body copy renders in a real (non-dim) text color — regression for the low-contrast complaint', () => {
    renderCookiePolicy();
    const firstSection = document.getElementById(COOKIE_POLICY_SECTION_IDS[0]);
    const paragraph = firstSection!.querySelector('p');
    expect(paragraph, 'expected at least one paragraph in the first section').toBeTruthy();
    // The dim slate-300/400/500 grays that made this page hard to read must not come back.
    expect(paragraph!.closest('[class*="text-slate-3"],[class*="text-slate-4"],[class*="text-slate-5"]')).toBeNull();
  });
});
