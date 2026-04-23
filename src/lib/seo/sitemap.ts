import type { MetadataRoute } from 'next';
import { absoluteUrl } from './config';

// Which incident statuses are worth exposing in the sitemap.
//
//   pending / validated — active incidents users and search engines
//                         should see.
//   resolved            — historical record still useful to hikers
//                         researching a trail.
//   dismissed / expired — moderated away or timed out. Indexing these
//                         encourages stale / vandalised pages to rank.
//
// Kept as an explicit list (not "not in (...)") so a future status
// has to be triaged instead of silently flowing into search results.
const INDEXABLE_STATUSES = ['pending', 'validated', 'resolved'] as const;
type IndexableStatus = (typeof INDEXABLE_STATUSES)[number];

export interface SitemapIncidentRow {
  id: string;
  status: string;
  updated_at: string | null;
  created_at: string;
}

/**
 * Pure sitemap-entry builder used by `app/sitemap.ts`. Kept separate
 * from the route so unit tests can exercise the filtering + URL
 * shape without standing up a Supabase fixture.
 *
 * Filtering rules (documented once, tested once):
 *   * Static pages are always emitted.
 *   * Incident rows are emitted only when their status is in the
 *     INDEXABLE_STATUSES list.
 *   * `lastModified` prefers `updated_at` (reflects author edits /
 *     follow-ups) and falls back to `created_at`.
 *   * Changefreq and priority are heuristics Google largely ignores
 *     today, but some smaller engines still honour them and they're
 *     cheap signal to emit.
 */
export function buildSitemapEntries(
  incidents: readonly SitemapIncidentRow[],
  now: Date = new Date(),
): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl('/'),
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 1.0,
    },
    {
      url: absoluteUrl('/privacy'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: absoluteUrl('/terms'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: absoluteUrl('/cookies'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  const indexable = new Set<IndexableStatus>(INDEXABLE_STATUSES);
  const incidentEntries: MetadataRoute.Sitemap = incidents
    .filter((row): row is SitemapIncidentRow =>
      indexable.has(row.status as IndexableStatus),
    )
    .map((row) => ({
      url: absoluteUrl(`/incidents/${row.id}`),
      lastModified: new Date(row.updated_at ?? row.created_at),
      changeFrequency: 'daily',
      priority: row.status === 'pending' ? 0.8 : 0.5,
    }));

  return [...staticEntries, ...incidentEntries];
}
