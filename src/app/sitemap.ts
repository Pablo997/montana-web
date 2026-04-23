import type { MetadataRoute } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildSitemapEntries, type SitemapIncidentRow } from '@/lib/seo/sitemap';
import { captureServerError } from '@/lib/observability/sentry';

// Sitemaps are served on-demand by Next.js and cached by the platform
// CDN. `revalidate = 3600` means every hour at most one request hits
// the DB; fresher than waiting for a full deploy, cheap enough that a
// hot crawler can't DDoS Postgres through this endpoint.
export const revalidate = 3600;

// Hard cap so a runaway incidents table never generates a 50 MB
// sitemap. Sitemaps.org allows up to 50k URLs per file anyway; if we
// ever breach 10k incidents we can split with a sitemap index. Until
// then the cap is a cheap guardrail.
const INCIDENT_LIMIT = 10_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let rows: SitemapIncidentRow[] = [];

  try {
    const supabase = createSupabaseServerClient();
    // Only select the columns we consume in `buildSitemapEntries`;
    // this also keeps the query planner's choice stable.
    const { data, error } = await supabase
      .from('incidents')
      .select('id, status, updated_at, created_at')
      .in('status', ['pending', 'validated', 'resolved'])
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(INCIDENT_LIMIT);

    if (error) {
      captureServerError(error, { tag: 'seo.sitemap' });
    } else if (data) {
      rows = data as SitemapIncidentRow[];
    }
  } catch (err) {
    // Never let a sitemap failure bubble up — crawlers interpret a
    // 5xx as "site is down" and back off for hours. An empty sitemap
    // is infinitely better than no sitemap at all.
    captureServerError(err, { tag: 'seo.sitemap' });
  }

  return buildSitemapEntries(rows);
}
