'use client';

import { useEffect } from 'react';
import { useMapStore } from '@/store/useMapStore';
import type { Incident } from '@/types/incident';

interface Props {
  incident: Incident;
}

/**
 * Tiny client component that seeds the map store with an incident fetched
 * on the server (deep-link entry point `/incidents/[id]`). Once mounted
 * the rest of the app works as normal:
 *   - the details panel pulls the row out of the store
 *   - `MapView` pans to its coordinates
 *   - realtime keeps it in sync with any future updates
 */
export function IncidentDeepLinkBootstrap({ incident }: Props) {
  const upsertIncident = useMapStore((s) => s.upsertIncident);
  const select = useMapStore((s) => s.select);

  useEffect(() => {
    upsertIncident(incident);
    select(incident.id);
  }, [incident, upsertIncident, select]);

  return null;
}
