import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FloatingHeader } from '@/components/layout/FloatingHeader';
import { AppFooterLinks } from '@/components/layout/AppFooterLinks';
import { LegalNotice } from '@/components/layout/LegalNotice';
import { ConsentSync } from '@/components/layout/ConsentSync';
import { MapView } from '@/components/map/MapView';
import { IncidentDeepLinkBootstrap } from '@/components/incidents/IncidentDeepLinkBootstrap';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { rowToIncident } from '@/lib/incidents/mappers';
import { absoluteUrl } from '@/lib/seo/config';
import { incidentJsonLdString } from '@/lib/seo/jsonld';
import {
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
  type Incident,
} from '@/types/incident';

interface PageProps {
  params: { id: string };
}

/**
 * Server-side incident lookup shared by `generateMetadata` and the page
 * itself. The Next 14 fetch cache dedupes identical requests in the
 * same render pass, so we do not pay the round-trip twice.
 */
async function loadIncident(id: string): Promise<Incident | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc('get_incident_by_id', { p_id: id })
    .maybeSingle();

  if (error) {
    console.error('get_incident_by_id failed', error);
    return null;
  }
  if (!data) return null;
  return rowToIncident(data as Parameters<typeof rowToIncident>[0]);
}

async function loadFirstMediaUrl(id: string): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from('incident_media')
    .select('storage_path')
    .eq('incident_id', id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data?.storage_path) return null;
  return supabase.storage.from('incident-media').getPublicUrl(data.storage_path)
    .data.publicUrl;
}

/**
 * Fetches every public media URL attached to the incident, capped so
 * JSON-LD doesn't balloon. Two consumers share this:
 *   * `generateMetadata` — uses the first URL for OG card.
 *   * the page itself    — feeds them all into JSON-LD image array.
 *
 * Next's fetch cache doesn't dedupe Supabase SDK calls; keeping this
 * function separate avoids duplicating the query logic.
 */
async function loadAllMediaUrls(id: string, limit = 6): Promise<string[]> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from('incident_media')
    .select('storage_path')
    .eq('incident_id', id)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (!data) return [];
  return data
    .map(
      (row) =>
        supabase.storage.from('incident-media').getPublicUrl(row.storage_path)
          .data.publicUrl,
    )
    .filter(Boolean);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const incident = await loadIncident(params.id);
  const canonical = absoluteUrl(`/incidents/${params.id}`);
  if (!incident) {
    // Matching `title.template` from the root layout turns this into
    // "Incident not found — Montana" without restating the suffix.
    return {
      title: 'Incident not found',
      alternates: { canonical },
      robots: { index: false, follow: false },
    };
  }

  const ogImage = await loadFirstMediaUrl(incident.id);
  const title = incident.title;
  const description = [
    INCIDENT_TYPE_LABELS[incident.type],
    SEVERITY_LABELS[incident.severity],
    incident.description,
  ]
    .filter(Boolean)
    .join(' · ');

  // Dismissed / expired incidents stay reachable by direct URL (push
  // notifications, saved links) but shouldn't be promoted in search
  // results — they're either moderated-away or irrelevant now.
  const indexable =
    incident.status === 'pending' ||
    incident.status === 'validated' ||
    incident.status === 'resolved';

  return {
    title,
    description,
    alternates: { canonical },
    robots: indexable
      ? undefined
      : { index: false, follow: true },
    openGraph: {
      title,
      description,
      type: 'article',
      url: canonical,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function IncidentDeepLinkPage({ params }: PageProps) {
  const incident = await loadIncident(params.id);
  if (!incident) notFound();

  // JSON-LD runs in parallel with the page render. We intentionally
  // use the full set of media URLs here (capped at 6) so the Event
  // structured data can give Google multiple images to pick from —
  // that's how you end up with the richer "large image" card in
  // search results.
  const mediaUrls = await loadAllMediaUrls(incident.id);
  const ldJson = incidentJsonLdString(incident, mediaUrls);

  // Deep-link route: shares the same floating-header shell as the home
  // page so opening an incident from a push notification feels native
  // instead of dropping the user on a visually distinct sub-page.
  // `IncidentDeepLinkBootstrap` is what actually opens the detail panel
  // after the map mounts, keyed off `incident.id`.
  return (
    <div className="map-shell">
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <script
        type="application/ld+json"
        // Safe: `ldJson` is produced by `incidentJsonLdString` which
        // escapes `</script>` sequences in user input.
        dangerouslySetInnerHTML={{ __html: ldJson }}
      />
      <MapView />
      <FloatingHeader />
      <AppFooterLinks />
      <LegalNotice />
      <ConsentSync />
      <IncidentDeepLinkBootstrap incident={incident} />
    </div>
  );
}
