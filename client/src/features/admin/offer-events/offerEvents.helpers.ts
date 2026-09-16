/**
 * Helpers compartilhados pelas duas páginas da aba Ofertas do admin.
 *
 * `resolveThumb` estava duplicado byte-a-byte em AdminOfferEventsPage e
 * AdminOfferEventManagePage — era o único par idêntico do client inteiro.
 */

/** Absolutiza a URL da miniatura; deixa URLs já absolutas e caminhos relativos intactos. */
export function resolveThumb(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window !== 'undefined' && url.startsWith('/'))
    return `${window.location.origin}${url}`;
  return url;
}
