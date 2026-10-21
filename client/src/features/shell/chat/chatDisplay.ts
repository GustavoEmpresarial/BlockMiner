import { addUtcDays, formatUtcDate, formatUtcTime, isSameUtcDay, utcDateKey } from '../../../shared/utils/utcTime';
/**
 * Chat display helpers — day bucketing + safe decode of legacy entity-encoded rows.
 * Messages are always rendered as React text nodes (never dangerouslySetInnerHTML).
 */

/** Undo escapeHtml() that older chat.service stored in DB (`&lt;3` → `<3`). Safe: no DOM. */
export function decodeLegacyChatEntities(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

/** Chat day separators follow UTC calendar days (product rule: whole site in UTC). */
export function sameUtcDay(a: Date, b: Date): boolean {
  return isSameUtcDay(a, b);
}

export function dayBucketKey(isoOrDate: string | number | Date | null | undefined): string {
  const d = new Date(isoOrDate ?? 0);
  if (Number.isNaN(d.getTime())) return 'invalid';
  return utcDateKey(d);
}

export function formatChatDayLabel(
  isoOrDate: string | number | Date | null | undefined,
  locale: string,
  labels: { today: string; yesterday: string },
): string {
  const d = new Date(isoOrDate ?? 0);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (sameUtcDay(d, now)) return labels.today;
  if (sameUtcDay(d, addUtcDays(-1, now))) return labels.yesterday;
  return formatUtcDate(d, {
    locale: locale || undefined,
    fallback: '',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: d.getUTCFullYear() !== now.getUTCFullYear() ? 'numeric' : undefined,
  });
}

export function formatChatTime(
  isoOrDate: string | number | Date | null | undefined,
  locale: string,
): string {
  const d = new Date(isoOrDate ?? 0);
  if (Number.isNaN(d.getTime())) return '';
  return formatUtcTime(d, { locale: locale || undefined, fallback: '' });
}

export type ChatTimelineItem<T> =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'message'; key: string; message: T };

export function buildChatTimeline<T extends { id?: string | number; createdAt?: string | number | Date | null }>(
  messages: T[],
  locale: string,
  labels: { today: string; yesterday: string },
): ChatTimelineItem<T>[] {
  const out: ChatTimelineItem<T>[] = [];
  let lastDay = '';
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    const bucket = dayBucketKey(msg.createdAt);
    if (bucket !== lastDay) {
      lastDay = bucket;
      out.push({
        kind: 'day',
        key: `day-${bucket}`,
        label: formatChatDayLabel(msg.createdAt, locale, labels),
      });
    }
    out.push({
      kind: 'message',
      key: `msg-${String(msg.id ?? i)}-${bucket}`,
      message: msg,
    });
  }
  return out;
}
