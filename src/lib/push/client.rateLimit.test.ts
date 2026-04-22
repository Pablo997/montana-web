import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTERVAL_SECONDS,
  MAX_INTERVAL_SECONDS,
  MIN_INTERVAL_SECONDS,
  normalizeIntervalSeconds,
} from './client';

describe('normalizeIntervalSeconds', () => {
  it('keeps in-range values untouched', () => {
    expect(normalizeIntervalSeconds(60)).toBe(60);
    expect(normalizeIntervalSeconds(600)).toBe(600);
    expect(normalizeIntervalSeconds(3600)).toBe(3600);
  });

  it('rounds fractional values', () => {
    expect(normalizeIntervalSeconds(600.4)).toBe(600);
    expect(normalizeIntervalSeconds(600.6)).toBe(601);
  });

  it('clamps below the minimum', () => {
    expect(normalizeIntervalSeconds(0)).toBe(MIN_INTERVAL_SECONDS);
    expect(normalizeIntervalSeconds(-5)).toBe(MIN_INTERVAL_SECONDS);
    expect(normalizeIntervalSeconds(59)).toBe(MIN_INTERVAL_SECONDS);
  });

  it('clamps above the maximum', () => {
    expect(normalizeIntervalSeconds(MAX_INTERVAL_SECONDS + 1)).toBe(
      MAX_INTERVAL_SECONDS,
    );
    expect(normalizeIntervalSeconds(Number.POSITIVE_INFINITY)).toBe(
      MAX_INTERVAL_SECONDS,
    );
  });

  it('falls back to the default for non-numeric input', () => {
    expect(normalizeIntervalSeconds(null)).toBe(DEFAULT_INTERVAL_SECONDS);
    expect(normalizeIntervalSeconds(undefined)).toBe(DEFAULT_INTERVAL_SECONDS);
    expect(normalizeIntervalSeconds('not a number')).toBe(
      DEFAULT_INTERVAL_SECONDS,
    );
    expect(normalizeIntervalSeconds(Number.NaN)).toBe(DEFAULT_INTERVAL_SECONDS);
  });

  it('parses numeric strings as Supabase sometimes returns them', () => {
    expect(normalizeIntervalSeconds('900')).toBe(900);
  });
});
