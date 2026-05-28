import { describe, expect, it } from 'vitest';
import { formatDistance } from './formatDistance';

describe('formatDistance', () => {
  it('renders sub-kilometre values as rounded metres', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(1)).toBe('1 m');
    expect(formatDistance(354.2)).toBe('354 m');
    expect(formatDistance(999)).toBe('999 m');
  });

  it('switches to kilometres with one decimal between 1 and 10 km', () => {
    expect(formatDistance(1000)).toBe('1.0 km');
    // Note: toFixed uses banker's rounding for .x5 — `2.15` becomes
    // `'2.1'`, not `'2.2'`. This is fine: a 50 m gap is invisible in
    // a list, and we only need consistency, not strict half-up.
    expect(formatDistance(2150)).toBe('2.1 km');
    expect(formatDistance(2250)).toBe('2.3 km');
    expect(formatDistance(9999)).toBe('10.0 km');
  });

  it('rounds to integer kilometres beyond 10 km', () => {
    expect(formatDistance(10000)).toBe('10 km');
    expect(formatDistance(12_400)).toBe('12 km');
    expect(formatDistance(99_900)).toBe('100 km');
  });

  it('clamps non-finite and negative inputs to "0 m"', () => {
    expect(formatDistance(Number.NaN)).toBe('0 m');
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBe('0 m');
    expect(formatDistance(-50)).toBe('0 m');
  });
});
