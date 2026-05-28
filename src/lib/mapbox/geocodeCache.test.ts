import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetGeocodeCacheForTests,
  getCachedGeocode,
  setCachedGeocode,
} from './geocodeCache';
import type { SearchResult } from './geocoding';

const sample = (id: string): SearchResult => ({
  id,
  title: id,
  subtitle: '',
  center: [0, 0],
  bbox: null,
  suggestedZoom: 12,
  placeType: 'place',
});

describe('geocodeCache', () => {
  beforeEach(() => {
    _resetGeocodeCacheForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null on miss', () => {
    expect(getCachedGeocode('madrid', 'es', undefined)).toBeNull();
  });

  it('hits within TTL', () => {
    setCachedGeocode('madrid', 'es', undefined, [sample('a')]);
    expect(getCachedGeocode('madrid', 'es', undefined)?.[0].id).toBe('a');
  });

  it('expires after TTL', () => {
    setCachedGeocode('madrid', 'es', undefined, [sample('a')]);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(getCachedGeocode('madrid', 'es', undefined)).toBeNull();
  });

  it('buckets proximity to 0.1°', () => {
    setCachedGeocode('plaza', 'es', [-3.7038, 40.4168], [sample('a')]);
    expect(getCachedGeocode('plaza', 'es', [-3.7028, 40.4168])).not.toBeNull();
    expect(getCachedGeocode('plaza', 'es', [-3.2, 40.4168])).toBeNull();
  });
});
