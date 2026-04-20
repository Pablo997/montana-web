'use client';

import { useMapStore } from '@/store/useMapStore';
import { IncidentCard } from './IncidentCard';

export function IncidentDetailsPanel() {
  const selectedId = useMapStore((s) => s.selectedId);
  const incidents = useMapStore((s) => s.incidents);
  const close = useMapStore((s) => s.select);

  if (!selectedId) return null;
  const incident = incidents.get(selectedId);
  if (!incident) return null;

  return (
    <aside className="panel" aria-label="Incident details">
      <div className="panel__header">
        <h2 className="panel__title">Incident details</h2>
        <button className="button" onClick={() => close(null)} aria-label="Close panel">
          Close
        </button>
      </div>
      <IncidentCard incident={incident} />
    </aside>
  );
}
