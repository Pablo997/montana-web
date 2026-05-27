import { describe, expect, it } from 'vitest';
import {
  BASEMAPS,
  DEFAULT_BASEMAP_ID,
  getBasemap,
  type BasemapId,
} from './basemaps';

describe('basemaps', () => {
  it('exposes a non-empty curated list', () => {
    expect(BASEMAPS.length).toBeGreaterThan(0);
  });

  it('uses unique ids for every basemap', () => {
    const ids = BASEMAPS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the default basemap id', () => {
    expect(BASEMAPS.some((b) => b.id === DEFAULT_BASEMAP_ID)).toBe(true);
  });

  describe('getBasemap', () => {
    it('returns the matching entry for a known id', () => {
      const id: BasemapId = 'satellite';
      const entry = getBasemap(id);
      expect(entry.id).toBe(id);
    });

    it('falls back to the default for unknown ids', () => {
      const entry = getBasemap('does-not-exist');
      expect(entry.id).toBe(DEFAULT_BASEMAP_ID);
    });

    it('falls back to the default for null / undefined', () => {
      expect(getBasemap(null).id).toBe(DEFAULT_BASEMAP_ID);
      expect(getBasemap(undefined).id).toBe(DEFAULT_BASEMAP_ID);
    });
  });
});
