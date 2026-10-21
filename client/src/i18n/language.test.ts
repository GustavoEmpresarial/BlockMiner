import { describe, expect, it } from 'vitest';
import { normalizeBrowserLanguage, resolveInitialLanguage } from './language';

describe('idioma inicial', () => {
  it.each([
    ['en-US', 'en'],
    ['en-GB', 'en'],
    ['fr-FR', 'en'],
    ['de', 'en'],
    ['ru-RU', 'en'],
    ['zh-CN', 'en'],
    ['', 'en'],
    ['pt-BR', 'pt-BR'],
    ['pt-PT', 'pt-BR'],
    ['es-MX', 'es'],
  ])('navegador %s → %s', (browser, expected) => {
    expect(normalizeBrowserLanguage(browser)).toBe(expected);
  });

  it('estrangeiro sem escolha manual vai para inglês mesmo com lang="pt-BR" no html', () => {
    expect(
      resolveInitialLanguage({ navigatorLanguages: ['fr-FR', 'fr'], navigatorLanguage: 'fr-FR', htmlLang: 'pt-BR' }),
    ).toBe('en');
  });

  it('navegador sem idioma nenhum vai para inglês, não para o lang do html', () => {
    expect(resolveInitialLanguage({ navigatorLanguages: [], navigatorLanguage: '', htmlLang: 'pt-BR' })).toBe('en');
  });

  it('usa o primeiro idioma preferido do navegador', () => {
    expect(resolveInitialLanguage({ navigatorLanguages: ['pt-BR', 'en-US'] })).toBe('pt-BR');
    expect(resolveInitialLanguage({ navigatorLanguages: ['en-US', 'pt-BR'] })).toBe('en');
  });

  it('pt-BR salvo automaticamente (sem escolha manual) não prende o estrangeiro em português', () => {
    expect(
      resolveInitialLanguage({ storedLanguage: 'pt-BR', storedLanguageUserSet: false, navigatorLanguages: ['en-US'] }),
    ).toBe('en');
  });

  it('escolha manual no seletor vence o navegador', () => {
    expect(
      resolveInitialLanguage({ storedLanguage: 'pt-BR', storedLanguageUserSet: true, navigatorLanguages: ['en-US'] }),
    ).toBe('pt-BR');
  });

  it('?lng= e cookie i18next vencem o navegador', () => {
    expect(resolveInitialLanguage({ search: '?lng=es', navigatorLanguages: ['en-US'] })).toBe('es');
    expect(resolveInitialLanguage({ cookieString: 'a=1; i18next=pt-BR', navigatorLanguages: ['en-US'] })).toBe('pt-BR');
  });
});
