import type { Incident } from '@/types/incident';
import { SITE_NAME, SITE_URL, absoluteUrl } from './config';

// JSON-LD structured data for the public surface.
//
// Schema.org doesn't have a perfect fit for "community-reported
// hazard on a trail", so we map incidents to the closest vocab and
// let search engines draw their own conclusions:
//   * `Event`            — has a start time, a location, a status.
//     Also what Google renders as a rich card (date + title +
//     image) which is what we want for incidents that matter.
//   * `Place`            — nested inside the event to give the
//     coordinates. We avoid emitting an `address` because we don't
//     geocode on the server and an empty one hurts validation.
//   * `eventStatus`      — Schema vocabulary for scheduled /
//     postponed / cancelled. We map our internal statuses onto it.
//
// Serialising this pre-stringified means callers can drop it into a
// <script type="application/ld+json"> with no further formatting.

const EVENT_STATUS_MAP: Record<Incident['status'], string> = {
  // Active reports.
  pending: 'https://schema.org/EventScheduled',
  validated: 'https://schema.org/EventScheduled',
  // Closed out.
  resolved: 'https://schema.org/EventCancelled',
  dismissed: 'https://schema.org/EventCancelled',
  expired: 'https://schema.org/EventCancelled',
};

export interface IncidentJsonLd {
  '@context': 'https://schema.org';
  '@type': 'Event';
  name: string;
  description?: string;
  url: string;
  startDate: string;
  endDate?: string;
  eventStatus: string;
  eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode';
  isAccessibleForFree: true;
  location: {
    '@type': 'Place';
    name: string;
    geo: {
      '@type': 'GeoCoordinates';
      latitude: number;
      longitude: number;
      elevation?: number;
    };
  };
  image?: string[];
  organizer: {
    '@type': 'Organization';
    name: string;
    url: string;
  };
}

export function incidentToJsonLd(
  incident: Incident,
  imageUrls: readonly string[] = [],
): IncidentJsonLd {
  const base: IncidentJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: incident.title,
    url: absoluteUrl(`/incidents/${incident.id}`),
    startDate: incident.createdAt,
    eventStatus: EVENT_STATUS_MAP[incident.status],
    // Physical-world report, not a webinar. Marking this explicitly
    // keeps search engines from classifying it as a virtual event.
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    isAccessibleForFree: true,
    location: {
      '@type': 'Place',
      name: incident.title,
      geo: {
        '@type': 'GeoCoordinates',
        latitude: incident.location.lat,
        longitude: incident.location.lng,
      },
    },
    organizer: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
  };

  if (incident.description) {
    base.description = incident.description;
  }
  if (typeof incident.elevationM === 'number') {
    base.location.geo.elevation = incident.elevationM;
  }
  // Events that "ended" get an endDate so rich results render
  // them as past rather than upcoming.
  if (
    incident.status === 'resolved' ||
    incident.status === 'dismissed' ||
    incident.status === 'expired'
  ) {
    base.endDate = incident.updatedAt;
  }
  if (imageUrls.length > 0) {
    base.image = [...imageUrls];
  }

  return base;
}

/**
 * Convenience wrapper that returns the LD payload as the exact
 * string you drop into `<script>` bodies.
 *
 * The `</` → `<\/` replacement is the standard HTML-script-context
 * defence against an attacker smuggling a closing `</script>` tag
 * through a user-controlled field (incident title, description)
 * and injecting their own script after it. JSON.stringify alone
 * does NOT escape this case, so we do it here.
 */
export function incidentJsonLdString(
  incident: Incident,
  imageUrls: readonly string[] = [],
): string {
  return JSON.stringify(incidentToJsonLd(incident, imageUrls)).replace(
    /<\/(script)/gi,
    '<\\/$1',
  );
}
