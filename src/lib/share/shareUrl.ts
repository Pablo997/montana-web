import {
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
  type Incident,
} from '@/types/incident';

export interface SharePayload {
  title: string;
  text: string;
  url: string;
}

/**
 * Canonical deep-link path for an incident. Kept as a dedicated helper
 * so any future routing changes (e.g. locale prefix) only need to be
 * made in one place and the tests stay meaningful.
 */
export function incidentPath(id: string): string {
  return `/incidents/${id}`;
}

/**
 * Normalise an origin-like string into a clean `https://host` form:
 * strips whitespace and any trailing slash so concatenating with a
 * leading-slash path never produces `https://host//incidents/...`.
 */
function normaliseOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/u, '');
}

/**
 * Build the payload consumed by `navigator.share` (or rendered as
 * plain text when we fall back to the clipboard).
 *
 * - `title` is used by OS share sheets that render a header.
 * - `text` is the body most apps prepend before the URL (WhatsApp,
 *   Messages, etc.); we pack type + severity here so the recipient
 *   gets context before tapping the link.
 * - `url` is the fully-qualified absolute URL — required by Safari,
 *   which silently drops shares whose URL is relative.
 */
export function buildIncidentSharePayload(
  incident: Incident,
  origin: string,
): SharePayload {
  const base = normaliseOrigin(origin);
  const url = `${base}${incidentPath(incident.id)}`;

  const typeLabel = INCIDENT_TYPE_LABELS[incident.type];
  const severityLabel = SEVERITY_LABELS[incident.severity];
  const text = `${typeLabel} · ${severityLabel}`;

  return {
    title: incident.title,
    text,
    url,
  };
}
