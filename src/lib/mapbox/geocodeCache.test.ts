import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetGeocodeCacheForTests,
  getCachedGeocode,
  setCachedGeocode,
} from './geocodeCache';
import type { SearchResult } from './geocoding';

/**
 * The cache directly mediates how often we hit MapTiler's
 * Geocoding API. Every failure mode here translates into "we paid
 * for something we already had cached" ÔÇö so the tests are tighter
 * than they would be for a pure in-memory speedup.
 */

const sampleResult = (id: string): SearchResult => ({
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

  it('returns null on a cold lookup', () => {
    expect(getCachedGeocode('madrid', 'es', undefined)).toBeNull();
  });

  it('returns cached results within the TTL', () => {
    const results = [sampleResult('a')];
    setCachedGeocode('madrid', 'es', undefined, results);
    expect(getCachedGeocode('madrid', 'es', undefined)).toEqual(results);
  });

  it('treats the query as case-insensitive', () => {
    setCachedGeocode('Madrid', 'es', undefined, [sampleResult('a')]);
    expect(getCachedGeocode('MADRID', 'es', undefined)).not.toBeNull();
    expect(getCachedGeocode('  madrid  ', 'es', undefined)).not.toBeNull();
  });

  it('keys by locale ÔÇö same query in different languages does NOT collide', () => {
    setCachedGeocode('madrid', 'es', undefined, [sampleResult('es')]);
    setCachedGeocode('madrid', 'en', undefined, [sampleResult('en')]);
    expect(getCachedGeocode('madrid', 'es', undefined)?.[0].id).toBe('es');
    expect(getCachedGeocode('madrid', 'en', undefined)?.[0].id).toBe('en');
  });

  it('buckets proximity to 0.1┬░ so micro-pans do not invalidate the cache', () => {
    setCachedGeocode('plaza', 'es', [-3.7038, 40.4168], [sampleResult('a')]);
    // ~100 m east ÔÇö within the same 0.1┬░ bucket. Must hit.
    expect(getCachedGeocode('plaza', 'es', [-3.7028, 40.4168])).not.toBeNull();
    // ~50 km east ÔÇö different bucket. Must miss.
    expect(getCachedGeocode('plaza', 'es', [-3.2, 40.4168])).toBeNull();
  });

  it('treats undefined proximity as its own bucket', () => {
    setCachedGeocode('madrid', 'es', undefined, [sampleResult('a')]);
    expect(getCachedGeocode('madrid', 'es', [0, 0])).toBeNull();
  });

  it('expires entries after the TTL window', () => {
    setCachedGeocode('madrid', 'es', undefined, [sampleResult('a')]);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(getCachedGeocode('madrid', 'es', undefined)).toBeNull();
  });

  it('caches empty results (no match) to avoid re-issuing dead queries', () => {
    setCachedGeocode('zzzzz', 'es', undefined, []);
    expect(getCachedGeocode('zzzzz', 'es', undefined)).toEqual([]);
  });

  it('evicts the least-recently-used entry once the cap is reached', () => {
    // Fill the cache to capacity, then probe each entry to record
    // recency. We then insert one more ÔÇö the oldest UN-PROBED entry
    // should be evicted because every probed entry has been bumped
    // to the back of the LRU queue.
    for (let i = 0; i < 50; i++) {
      setCachedGeocode(`q${i}`, 'es', undefined, [sampleResult(`r${i}`)]);
    }
    // Touch the second entry so it's NOT the LRU candidate.
    expect(getCachedGeocode('q1', 'es', undefined)).not.toBeNull();
    // Insert beyond capacity. q0 was the LRU; it should be gone now.
    setCachedGeocode('q50', 'es', undefined, [sampleResult('r50')]);
    expect(getCachedGeocode('q0', 'es', undefined)).toBeNull();
    expect(getCachedGeocode('q1', 'es', undefined)).not.toBeNull();
    expect(getCachedGeocode('q50', 'es', undefined)).not.toBeNull();
  });
});
