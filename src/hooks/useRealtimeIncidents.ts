'use client';

import { useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { rowToIncident, InvalidIncidentLocationError } from '@/lib/incidents/mappers';
import { useMapStore } from '@/store/useMapStore';

/**
 * Subscribe to incident changes via Supabase Realtime and keep the
 * in-memory map store in sync. Call once from the root map page.
 *
 * Implementation note — "why is my incident stuck in the top-left of
 * the map":
 *
 * Realtime payloads for `public.incidents` deliver the raw row, not
 * the shape returned by our RPCs. That means the flat `lng` / `lat`
 * columns are absent and only the PostGIS `location` column is
 * present — and the Postgres logical-replication decoder on the wire
 * may serialise it as WKB hex, as a GeoJSON object, or not at all
 * (null) depending on the Supabase release. When the mapper can't
 * extract a point it used to fall back to `{ lat: 0, lng: 0 }`, which
 * placed every newly-updated incident on null-island and — on a map
 * centred on Europe at a low zoom — in the upper-left corner of the
 * viewport.
 *
 * With the 00032 / 00033 audit triggers every comment / edit now
 * produces an UPDATE on `incidents.updated_at`, so the rate of
 * malformed payloads went from rare to constant and the bug became
 * visible in production.
 *
 * Fix: on UPDATE, if the payload doesn't carry usable coordinates,
 * copy them from the row we already have in the store (which came
 * from the bbox RPC and is definitely valid). INSERTs without
 * coords are dropped silently — we'll pick them up on the next
 * viewport refresh through the proper RPC.
 */
export function useRealtimeIncidents() {
  const upsert = useMapStore((s) => s.upsertIncident);
  const remove = useMapStore((s) => s.removeIncident);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel('incidents-stream')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id?: string };
            if (oldRow.id) remove(oldRow.id);
            return;
          }

          const row = payload.new as Parameters<typeof rowToIncident>[0] & {
            id: string;
          };

          let incident;
          try {
            incident = rowToIncident(row);
          } catch (err) {
            if (!(err instanceof InvalidIncidentLocationError)) throw err;
            // Coordinates weren't usable. Patch with the ones we
            // already know from the store, if any. Otherwise drop —
            // the row will come back on the next bbox refresh with
            // real coordinates.
            const known = useMapStore.getState().incidents.get(row.id);
            if (!known) return;
            try {
              incident = rowToIncident({
                ...row,
                lng: known.location.lng,
                lat: known.location.lat,
              });
            } catch {
              return;
            }
          }

          // The viewport RPCs filter to (pending | validated), so any
          // transition out of those states should drop the marker.
          if (incident.status === 'dismissed' || incident.status === 'resolved') {
            remove(incident.id);
          } else {
            upsert(incident);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [upsert, remove]);
}
