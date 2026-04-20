'use client';

import { useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { rowToIncident } from '@/lib/incidents/mappers';
import { useMapStore } from '@/store/useMapStore';

/**
 * Subscribe to incident changes via Supabase Realtime and keep the
 * in-memory map store in sync. Call once from the root map page.
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

          const row = payload.new as Parameters<typeof rowToIncident>[0];
          const incident = rowToIncident(row);
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
