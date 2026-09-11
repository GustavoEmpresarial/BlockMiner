import DOMPurify from 'isomorphic-dompurify';

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

export function sanitizeTrustedHtml(html: unknown): string {
  if (html == null) return '';
  return sanitizeHtml(String(html));
}
