import type { ElementType, HTMLAttributes } from 'react';
import { sanitizeTrustedHtml } from '../utils/sanitizeHtml';

type SafeHtmlProps = {
  html: unknown;
  as?: ElementType;
} & Omit<HTMLAttributes<HTMLElement>, 'dangerouslySetInnerHTML' | 'children'>;

/**
 * Renders curated i18n HTML after DOMPurify allowlist sanitization.
 * Prefer plain text / <Trans> for new copy; use this only when locale strings carry markup.
 */
export function SafeHtml({ html, as: Tag = 'div', className, ...rest }: SafeHtmlProps) {
  const clean = sanitizeTrustedHtml(html);
  if (!clean) return null;
  return <Tag className={className} {...rest} dangerouslySetInnerHTML={{ __html: clean }} />;
}
