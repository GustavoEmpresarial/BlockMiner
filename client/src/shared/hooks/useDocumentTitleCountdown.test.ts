import { describe, expect, it } from 'vitest';
import { formatDocumentTitleCountdown } from './useDocumentTitleCountdown';

describe('formatDocumentTitleCountdown', () => {
  it('shows seconds while active', () => {
    expect(formatDocumentTitleCountdown('Faucet', 12.2, false, false)).toBe('13s · Faucet');
  });

  it('shows pause marker when paused', () => {
    expect(formatDocumentTitleCountdown('Offerwall', 40, false, true)).toBe('⏸ 40s · Offerwall');
  });

  it('shows check when complete or zero', () => {
    expect(formatDocumentTitleCountdown('PTC', 5, true, false)).toBe('✓ · PTC');
    expect(formatDocumentTitleCountdown('PTC', 0, false, false)).toBe('✓ · PTC');
  });

  it('never yields NaN from bad remaining', () => {
    expect(formatDocumentTitleCountdown('Faucet', Number.NaN, false, false)).toBe('✓ · Faucet');
  });
});
