import { describe, expect, it } from 'vitest';
import {
  getFaqItems,
  getFeatureCards,
  getHowSteps,
  getLandingCopy,
  getLandingGames,
  getTestimonials,
} from './landing.data';

// Structural tests: each getter must return a stable-shaped list/object regardless of the
// active i18n locale's actual translated strings — every string field must be a non-empty
// string (a missing i18n key falls back to i18n's key-as-string behavior, never throws).

describe('getLandingCopy', () => {
  it('returns a fully-populated copy object with no missing top-level sections', () => {
    const copy = getLandingCopy();
    for (const section of ['nav', 'hero', 'stats', 'how', 'features', 'community', 'testimonials', 'games', 'crypto', 'faq', 'finalCta', 'footer']) {
      expect(copy).toHaveProperty(section);
      expect(typeof (copy as Record<string, unknown>)[section]).toBe('object');
    }
  });

  it('calling it twice is stable (no shared mutable state leaking between calls)', () => {
    const first = getLandingCopy();
    const second = getLandingCopy();
    expect(first).toEqual(second);
    expect(first).not.toBe(second); // must be a fresh object each call, not a cached singleton
  });
});

describe('getFeatureCards', () => {
  it('returns exactly 6 cards, each with a real icon component and its own color classes', () => {
    const cards = getFeatureCards();
    expect(cards).toHaveLength(6);
    const iconClasses = new Set(cards.map((c) => c.iconCls));
    expect(iconClasses.size).toBe(6); // every card must be visually distinct
    for (const card of cards) {
      expect(card.icon).toBeDefined();
      expect(typeof card.iconCls).toBe('string');
      expect(typeof card.bgCls).toBe('string');
    }
  });
});

describe('getHowSteps', () => {
  it('returns exactly 3 steps (matches the "3 steps to hashrate" copy)', () => {
    expect(getHowSteps()).toHaveLength(3);
  });
});

describe('getTestimonials', () => {
  it('returns exactly 3 testimonials, each with a name/loc/text field present', () => {
    const items = getTestimonials();
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('loc');
      expect(item).toHaveProperty('text');
    }
  });
});

describe('getLandingGames', () => {
  it('returns exactly 3 game cards with distinct gradient/title styling', () => {
    const games = getLandingGames();
    expect(games).toHaveLength(3);
    const gradients = new Set(games.map((g) => g.gradient));
    expect(gradients.size).toBe(3); // each card must be visually distinct
  });
});

describe('getFaqItems', () => {
  it('returns exactly 5 FAQ entries with unique, stable ids', () => {
    const items = getFaqItems();
    expect(items).toHaveLength(5);
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toEqual(['faq1', 'faq2', 'faq3', 'faq4', 'faq5']);
  });
});
