import { describe, expect, it } from 'vitest';
import {
  buildChatTimeline,
  dayBucketKey,
  decodeLegacyChatEntities,
  formatChatDayLabel,
} from './chatDisplay';

describe('decodeLegacyChatEntities', () => {
  it('decodes escapeHtml leftovers without DOM', () => {
    expect(decodeLegacyChatEntities('&lt;3 &amp; &#039;hi&#039;')).toBe("<3 & 'hi'");
    expect(decodeLegacyChatEntities('plain')).toBe('plain');
  });
});

describe('buildChatTimeline', () => {
  it('inserts a day separator when the calendar day changes', () => {
    const rows = buildChatTimeline(
      [
        { id: 1, createdAt: '2026-08-24T22:00:00.000Z', message: 'a' },
        { id: 2, createdAt: '2026-08-24T23:00:00.000Z', message: 'b' },
        { id: 3, createdAt: '2026-08-25T10:00:00.000Z', message: 'c' },
      ],
      'en',
      { today: 'Today', yesterday: 'Yesterday' },
    );
    const kinds = rows.map((r) => r.kind);
    expect(kinds.filter((k) => k === 'day').length).toBeGreaterThanOrEqual(1);
    expect(kinds.filter((k) => k === 'message')).toHaveLength(3);
    expect(dayBucketKey('2026-08-25T10:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('labels today/yesterday', () => {
    const now = new Date();
    expect(formatChatDayLabel(now, 'en', { today: 'Today', yesterday: 'Yesterday' })).toBe('Today');
  });
});
