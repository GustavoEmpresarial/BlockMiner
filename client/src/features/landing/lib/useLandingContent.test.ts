import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLandingContent } from './useLandingContent';

describe('useLandingContent', () => {
  it('returns copy + every list, matching getLandingCopy/getFeatureCards/etc. shapes', () => {
    const { result } = renderHook(() => useLandingContent());
    expect(result.current).toHaveProperty('copy');
    expect(result.current.featureCards).toHaveLength(6);
    expect(result.current.howSteps).toHaveLength(3);
    expect(result.current.testimonials).toHaveLength(3);
    expect(result.current.games).toHaveLength(3);
    expect(result.current.faqItems).toHaveLength(5);
  });

  it('memoizes its result across re-renders when the language does not change', () => {
    const { result, rerender } = renderHook(() => useLandingContent());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
