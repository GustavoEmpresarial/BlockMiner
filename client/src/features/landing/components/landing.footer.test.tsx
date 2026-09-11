import '@testing-library/jest-dom/vitest';
import { describe, expect, it, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { LandingFooter } from './landing.parts';

// Real i18next instance loaded with the actual pt-BR bundle (not a stub t()) — this is what
// caught the 2026-09-11 bug where landing.footer.link_terms/link_privacy held wrong copy
// ("Termos e políticas (manual)" / "Transparência e custos") that a hand-rolled `key => key`
// mock t() would never have surfaced.
const i18n = i18next.createInstance();
beforeAll(async () => {
  await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });
});

afterEach(() => {
  cleanup();
});

function renderFooter(overrides: Partial<{ twitterUrl: string | null; youtubeUrl: string | null }> = {}) {
  const twitterUrl = 'twitterUrl' in overrides ? overrides.twitterUrl! : 'https://x.com/blockminer';
  const youtubeUrl = 'youtubeUrl' in overrides ? overrides.youtubeUrl! : 'https://youtube.com/@blockminer';
  return render(
    <MemoryRouter>
      <LandingFooter
        t={i18n.t}
        discordUrl="https://discord.gg/blockminer"
        telegramUrl="https://t.me/blockminer"
        twitterUrl={twitterUrl}
        youtubeUrl={youtubeUrl}
      />
    </MemoryRouter>,
  );
}

describe('LandingFooter', () => {
  it('renders exactly one footer landmark (regression: used to stack a second <SiteFooter compact/> under this one)', () => {
    renderFooter();
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
  });

  it('shows the correct legal link copy — regression for the mistranslated link_terms/link_privacy keys', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute('href', '/terms-of-use');
    expect(within(footer).getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacy-policy');
    // The old, wrong copy must never come back.
    expect(within(footer).queryByText('Termos e políticas (manual)')).not.toBeInTheDocument();
    expect(within(footer).queryByText('Transparência e custos')).not.toBeInTheDocument();
  });

  it('every social link opens in a new tab with rel=noopener noreferrer (no reverse-tabnabbing) and has a real href', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    for (const label of ['Discord', 'Telegram', 'X', 'YouTube']) {
      const link = within(footer).getByRole('link', { name: label });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      expect(link.getAttribute('rel')).toContain('noreferrer');
      expect(link.getAttribute('href')).toMatch(/^https:\/\//);
    }
  });

  it('omits the X/YouTube buttons entirely when their URLs are not configured (no dead/empty links)', () => {
    renderFooter({ twitterUrl: null, youtubeUrl: null });
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).queryByRole('link', { name: 'X' })).not.toBeInTheDocument();
    expect(within(footer).queryByRole('link', { name: 'YouTube' })).not.toBeInTheDocument();
    // Discord/Telegram (always configured) still render.
    expect(within(footer).getByRole('link', { name: 'Discord' })).toBeInTheDocument();
  });

  it('the internal nav links point at real in-app routes, not # placeholders', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    const internalHrefs = ['/games', '/calculator', '/transparency', '/roadmap', '/manual', '/register'];
    for (const href of internalHrefs) {
      const link = within(footer).getAllByRole('link').find((el) => el.getAttribute('href') === href);
      expect(link, `expected a footer link to ${href}`).toBeTruthy();
    }
  });

  it('the "back to top" control is a real button, not a link (no # in the URL bar on click)', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    const button = within(footer).getByRole('button', { name: 'Voltar ao topo' });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('shows the current year in the copyright line', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText(new RegExp(String(new Date().getFullYear())))).toBeInTheDocument();
  });
});
