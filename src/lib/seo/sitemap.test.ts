import { describe, expect, it } from 'vitest';
import { buildSitemapEntries, type SitemapIncidentRow } from './sitemap';

const NOW = new Date('2026-04-20T10:00:00Z');

function inc(partial: Partial<SitemapIncidentRow>): SitemapIncidentRow {
  return {
    id: 'incident-id',
    status: 'pending',
    updated_at: null,
    created_at: '2026-04-19T09:00:00Z',
    ...partial,
  };
}

describe('buildSitemapEntries', () => {
  it('always emits the four static pages', () => {
    const entries = buildSitemapEntries([], NOW);
    const paths = entries.map((e) => new URL(e.url).pathname);
    expect(paths).toEqual(['/', '/privacy', '/terms', '/cookies']);
  });

  it('emits incidents whose status is indexable (pending/validated/resolved)', () => {
    const entries = buildSitemapEntries(
      [
        inc({ id: 'a', status: 'pending' }),
        inc({ id: 'b', status: 'validated' }),
        inc({ id: 'c', status: 'resolved' }),
      ],
      NOW,
    );
    const ids = entries
      .filter((e) => e.url.includes('/incidents/'))
      .map((e) => e.url.split('/').pop());
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('filters out dismissed and expired incidents', () => {
    const entries = buildSitemapEntries(
      [
        inc({ id: 'a', status: 'dismissed' }),
        inc({ id: 'b', status: 'expired' }),
        inc({ id: 'c', status: 'pending' }),
      ],
      NOW,
    );
    const ids = entries
      .filter((e) => e.url.includes('/incidents/'))
      .map((e) => e.url.split('/').pop());
    expect(ids).toEqual(['c']);
  });

  it('prefers updated_at over created_at for lastModified', () => {
    const entries = buildSitemapEntries(
      [
        inc({
          id: 'x',
          created_at: '2020-01-01T00:00:00Z',
          updated_at: '2026-04-19T12:00:00Z',
        }),
      ],
      NOW,
    );
    const target = entries.find((e) => e.url.endsWith('/incidents/x'));
    expect(target?.lastModified).toEqual(new Date('2026-04-19T12:00:00Z'));
  });

  it('falls back to created_at when updated_at is missing', () => {
    const entries = buildSitemapEntries(
      [
        inc({
          id: 'y',
          created_at: '2026-03-10T00:00:00Z',
          updated_at: null,
        }),
      ],
      NOW,
    );
    const target = entries.find((e) => e.url.endsWith('/incidents/y'));
    expect(target?.lastModified).toEqual(new Date('2026-03-10T00:00:00Z'));
  });

  it('gives pending incidents a higher priority than resolved ones', () => {
    const entries = buildSitemapEntries(
      [
        inc({ id: 'p', status: 'pending' }),
        inc({ id: 'r', status: 'resolved' }),
      ],
      NOW,
    );
    const p = entries.find((e) => e.url.endsWith('/p'));
    const r = entries.find((e) => e.url.endsWith('/r'));
    expect(p?.priority).toBeGreaterThan(r?.priority ?? 0);
  });
});
