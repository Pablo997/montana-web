import { describe, it, expect } from 'vitest';
import { normalizeCacheUrl, VOLATILE_QUERY_PARAMS } from './cacheKey';

describe('normalizeCacheUrl', () => {
  it('returns the input unchanged when there are no volatile params', () => {
    const url = 'https://api.maptiler.com/tiles/v3/10/512/384.pbf?key=abc';
    expect(normalizeCacheUrl(url)).toBe(url);
  });

  it('strips a single volatile param', () => {
    const url = 'https://api.maptiler.com/maps/streets/style.json?key=abc&mtsid=xyz';
    expect(normalizeCacheUrl(url)).toBe(
      'https://api.maptiler.com/maps/streets/style.json?key=abc',
    );
  });

  it('strips all volatile params in one pass', () => {
    const url =
      'https://api.maptiler.com/maps/streets/style.json?key=abc&mtsid=xyz&session=qqq&v=7';
    expect(normalizeCacheUrl(url)).toBe(
      'https://api.maptiler.com/maps/streets/style.json?key=abc',
    );
  });

  it('preserves non-volatile params unchanged', () => {
    const url =
      'https://api.maptiler.com/tiles/v3/10/512/384.pbf?key=abc&mtsid=xyz&foo=bar';
    const normalized = new URL(normalizeCacheUrl(url));
    expect(normalized.searchParams.get('key')).toBe('abc');
    expect(normalized.searchParams.get('foo')).toBe('bar');
    expect(normalized.searchParams.has('mtsid')).toBe(false);
  });

  it('two URLs differing only in volatile params normalize to the same key', () => {
    const a =
      'https://api.maptiler.com/maps/streets/style.json?key=abc&mtsid=session-one';
    const b =
      'https://api.maptiler.com/maps/streets/style.json?key=abc&mtsid=session-two';
    expect(normalizeCacheUrl(a)).toBe(normalizeCacheUrl(b));
  });

  it('handles URLs without query strings', () => {
    const url = 'https://example.com/foo/bar';
    expect(normalizeCacheUrl(url)).toBe(url);
  });

  it('exposes the full list of volatile params', () => {
    // Smoke test that guards against accidental edits to the tuple:
    // changing this list silently would decouple the SW from this
    // helper, which is exactly the failure mode we're protecting
    // against.
    expect(VOLATILE_QUERY_PARAMS).toEqual(['mtsid', 'session', 'v']);
  });
});
