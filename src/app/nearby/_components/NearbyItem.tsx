'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { INCIDENT_GLYPHS } from '@/components/map/markerIcons';
import { useIncidentLabels } from '@/lib/incidents/useIncidentLabels';
import type { NearbyIncident } from '@/lib/incidents/api';
import { formatDistance } from '@/lib/utils/formatDistance';

interface Props {
  incident: NearbyIncident;
}

/**
 * Single row of the `/nearby` list.
 *
 * Design intent:
 *
 *   * **No remote thumbnails.** Each incident has 0..N photos hosted on
 *     Supabase Storage; fetching the URL would require a per-row
 *     round-trip (or an extra column on the RPC). On a slow connection
 *     loading 50 thumbnails is exactly the problem the list page is
 *     supposed to solve. Instead we surface a photo *count* as a small
 *     pill: the user knows there's media without paying the bandwidth.
 *
 *   * **Glyph reuse.** We render the same SVG glyph used by the map
 *     markers (`INCIDENT_GLYPHS`) via `dangerouslySetInnerHTML`. The
 *     payload is a hard-coded constant in our own bundle, so the
 *     dangerous-HTML rule does not apply here.
 *
 *   * **The whole row is the click target.** Wrapping a `<Link>` around
 *     a card with internal interactive elements is fine here because
 *     there are none — we only show text and one anchor at the row
 *     level. Big tap target is critical on a gloved hand outdoors.
 */
export function NearbyItem({ incident }: Props) {
  const t = useTranslations('nearby');
  const labels = useIncidentLabels();

  return (
    <Link href={`/incidents/${incident.id}`} className="nearby-item" prefetch={false}>
      <span
        className={`nearby-item__icon nearby-item__icon--${incident.severity}`}
        aria-hidden
        dangerouslySetInnerHTML={{ __html: rawGlyphSvg(incident.type) }}
      />

      <div className="nearby-item__body">
        <div className="nearby-item__head">
          <h3 className="nearby-item__title">{incident.title}</h3>
          <span className="nearby-item__distance">{formatDistance(incident.distanceM)}</span>
        </div>

        <p className="nearby-item__meta">
          <span className="nearby-item__type">{labels.type(incident.type)}</span>
          <span aria-hidden className="nearby-item__sep">
            ·
          </span>
          <span className={`nearby-item__severity nearby-item__severity--${incident.severity}`}>
            {labels.severity(incident.severity)}
          </span>
          <span aria-hidden className="nearby-item__sep">
            ·
          </span>
          <time className="nearby-item__time" dateTime={incident.createdAt}>
            {formatRelative(incident.createdAt, t)}
          </time>
        </p>

        {incident.description ? (
          <p className="nearby-item__desc">{incident.description}</p>
        ) : null}

        <div className="nearby-item__footer">
          <span className="nearby-item__score" aria-label={t('scoreAria', { score: incident.score })}>
            ▲ {incident.score}
          </span>
          {incident.mediaCount > 0 ? (
            <span className="nearby-item__media" aria-label={t('photoCount', { count: incident.mediaCount })}>
              📷 {incident.mediaCount}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

/** Renders the glyph at 22×22 inside the row. Reuses the map marker
 *  SVG paths so the visual vocabulary is identical between list and
 *  map — users see the same icon for "wildlife" in both surfaces. */
function rawGlyphSvg(type: NearbyIncident['type']): string {
  return `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${INCIDENT_GLYPHS[type]}</svg>`;
}

/** Locale-aware "5m / 2h / 3d / 1w" via i18n keys. Mirrors the shape
 *  used by `ReportRow` so users see consistent freshness language
 *  across admin and public surfaces. */
function formatRelative(iso: string, t: ReturnType<typeof useTranslations<'nearby'>>): string {
  const diffMs = Date.now() - Date.parse(iso);
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 1) return t('relativeJustNow');
  if (minutes < 60) return t('relativeMinAgo', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('relativeHoursAgo', { count: hours });
  const days = Math.round(hours / 24);
  if (days < 7) return t('relativeDaysAgo', { count: days });
  const weeks = Math.round(days / 7);
  return t('relativeWeeksAgo', { count: weeks });
}
