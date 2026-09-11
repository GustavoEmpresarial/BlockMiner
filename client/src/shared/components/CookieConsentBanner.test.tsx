import '@testing-library/jest-dom/vitest';
import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../i18n/locales/pt-BR.json';
import CookieConsentBanner from './CookieConsentBanner';
import { getCookieConsent } from '../utils/cookieConsent';

const i18n = i18next.createInstance();
beforeAll(async () => {
  await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

function renderBanner() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <CookieConsentBanner />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('CookieConsentBanner', () => {
  it('shows on first visit (no stored consent yet)', () => {
    renderBanner();
    expect(screen.getByRole('button', { name: 'Aceitar todos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Só essenciais' })).toBeInTheDocument();
  });

  it('does not render at all when consent was already recorded (accepted)', () => {
    localStorage.setItem('blockminer_cookie_consent', 'accepted');
    renderBanner();
    expect(screen.queryByRole('button', { name: 'Aceitar todos' })).not.toBeInTheDocument();
  });

  it('does not render at all when consent was already recorded (declined)', () => {
    localStorage.setItem('blockminer_cookie_consent', 'declined');
    renderBanner();
    expect(screen.queryByRole('button', { name: 'Aceitar todos' })).not.toBeInTheDocument();
  });

  it('clicking "Aceitar todos" persists "accepted" and hides the banner', () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar todos' }));
    expect(getCookieConsent()).toBe('accepted');
    expect(screen.queryByRole('button', { name: 'Aceitar todos' })).not.toBeInTheDocument();
  });

  it('clicking "Só essenciais" persists "declined" and hides the banner', () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Só essenciais' }));
    expect(getCookieConsent()).toBe('declined');
    expect(screen.queryByRole('button', { name: 'Só essenciais' })).not.toBeInTheDocument();
  });

  it('links to the Cookie Policy page', () => {
    renderBanner();
    const link = screen.getByRole('link', { name: 'Política de Cookies' });
    expect(link).toHaveAttribute('href', '/cookie-policy');
  });

  it('renders as a floating card with a solid (non-transparent) background — regression for the "blends into the page" complaint', () => {
    renderBanner();
    const card = screen.getByRole('region').firstElementChild as HTMLElement;
    // Tailwind's bg-[#0a0f1c] arbitrary-value class must be present verbatim, not a
    // translucent/blur variant — this is what makes the popup legible over any page bg.
    expect(card.className).toMatch(/bg-\[#0a0f1c\]/);
    expect(card.className).not.toMatch(/backdrop-blur|bg-\S+\/[1-5]0\b/);
  });
});
