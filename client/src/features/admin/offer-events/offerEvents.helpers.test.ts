/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { resolveThumb } from './offerEvents.helpers';

describe('resolveThumb', () => {
  it('nulo, vazio e undefined viram null — card sem imagem', () => {
    expect(resolveThumb(null)).toBeNull();
    expect(resolveThumb(undefined)).toBeNull();
    expect(resolveThumb('')).toBeNull();
  });

  it('URL absoluta http(s) passa intacta', () => {
    expect(resolveThumb('https://cdn.example/e.png')).toBe('https://cdn.example/e.png');
    expect(resolveThumb('http://cdn.example/e.png')).toBe('http://cdn.example/e.png');
    expect(resolveThumb('HTTPS://CDN.EXAMPLE/E.PNG')).toBe('HTTPS://CDN.EXAMPLE/E.PNG');
  });

  it('caminho absoluto do site ganha origin — preview no admin não quebra no SPA', () => {
    expect(resolveThumb('/uploads/media/event.png')).toBe(
      `${window.location.origin}/uploads/media/event.png`,
    );
  });

  it('caminho relativo sem barra fica como veio', () => {
    expect(resolveThumb('media/event.png')).toBe('media/event.png');
  });
});
