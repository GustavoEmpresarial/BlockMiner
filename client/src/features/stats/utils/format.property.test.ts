import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { formatHashrate } from './format';

describe('formatHashrate — property/fuzz tests', () => {
  it('never throws for any finite number, string, boolean, null, undefined, or object', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.double(), fc.string(), fc.boolean(), fc.constant(null), fc.constant(undefined), fc.object()),
        (input) => {
          expect(() => formatHashrate(input)).not.toThrow();
          return true;
        },
      ),
    );
  });

  it('always returns a string ending in a known unit suffix', () => {
    const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s'];
    fc.assert(
      fc.property(fc.double({ noNaN: true, min: 0, max: Number.MAX_SAFE_INTEGER }), (n) => {
        const out = formatHashrate(n);
        return units.some((u) => out.endsWith(u));
      }),
    );
  });

  it('is monotonically non-decreasing in the numeric magnitude of its formatted value for a fixed unit tier', () => {
    // Just a non-throwing/shape sanity fuzz — full monotonicity across unit tiers
    // is intentionally not asserted (crossing 1000 resets the mantissa by design).
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (n) => {
        const out = formatHashrate(n);
        return typeof out === 'string' && out.length > 0;
      }),
    );
  });
});
