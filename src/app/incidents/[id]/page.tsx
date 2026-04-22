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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const incident = await loadIncident(params.id);
  if (!incident) {
    return { title: 'Incident not found — Montana' };
  }

  const ogImage = await loadFirstMediaUrl(incident.id);
  const title = `${incident.title} — Montana`;
  const description = [
    INCIDENT_TYPE_LABELS[incident.type],
    SEVERITY_LABELS[incident.severity],
    incident.description,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
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

  // Deep-link route: shares the same floating-header shell as the home
  // page so opening an incident from a push notification feels native
  // instead of dropping the user on a visually distinct sub-page.
  // `IncidentDeepLinkBootstrap` is what actually opens the detail panel
  // after the map mounts, keyed off `incident.id`.
  return (
    <div className="map-shell">
      <MapView />
      <FloatingHeader />
      <AppFooterLinks />
      <LegalNotice />
      <ConsentSync />
      <IncidentDeepLinkBootstrap incident={incident} />
    </div>
  );
}
