'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { fetchIncidentMedia } from '@/lib/incidents/api';
import type { IncidentMedia } from '@/types/incident';

interface Props {
  incidentId: string;
  /**
   * How many thumbnails the incident row advertises (`incidents.media_count`).
   * We render exactly this many skeleton tiles while the request is in
   * flight so the panel height is stable and there's no flash for
   * incidents that turn out to have no photos (they never mount this
   * component — see `IncidentCard`).
   */
  expectedCount: number;
}

/**
 * Thumbnail gallery rendered inside the details panel. Relies on the
 * denormalised `mediaCount` on the parent incident to decide whether to
 * mount, so it's only responsible for the fetch + render and never has
 * to handle the "empty" case.
 *
 * Clicking a thumbnail opens the full-size image in a new tab — cheap
 * alternative to a lightbox for the MVP.
 */
export function IncidentMediaGrid({ incidentId, expectedCount }: Props) {
  const [media, setMedia] = useState<IncidentMedia[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMedia(null);
    setError(null);

    fetchIncidentMedia(incidentId)
      .then((list) => {
        if (!cancelled) setMedia(list);
      })
      .catch((err) => {
        console.error('Failed to load incident media', err);
        if (!cancelled) setError('Could not load photos.');
      });

    return () => {
      cancelled = true;
    };
  }, [incidentId]);

  if (error) {
    return <p className="incident-media__error">{error}</p>;
  }

  if (media === null) {
    // Stable layout: match the count the server already told us about.
    const placeholders = Math.max(1, Math.min(expectedCount, 9));
    return (
      <div className="incident-media incident-media--loading" aria-live="polite">
        {Array.from({ length: placeholders }).map((_, i) => (
          <span key={i} className="incident-media__placeholder" />
        ))}
      </div>
    );
  }

  if (media.length === 0) return null;

  return (
    <div className="incident-media" role="list">
      {media.map((item) => {
        const ratio =
          item.width && item.height && item.width > 0 && item.height > 0
            ? `${item.width} / ${item.height}`
            : '1 / 1';

        return (
          <a
            key={item.id}
            href={item.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="incident-media__item"
            role="listitem"
            style={{ aspectRatio: ratio }}
          >
            <Image
              src={item.publicUrl}
              alt=""
              fill
              sizes="(max-width: 600px) 33vw, 160px"
              className="incident-media__image"
            />
          </a>
        );
      })}
    </div>
  );
}
