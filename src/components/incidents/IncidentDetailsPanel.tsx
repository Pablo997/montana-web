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
    <aside
      className="panel"
      aria-labelledby="incident-details-title"
      aria-live="polite"
      role="complementary"
    >
      <div className="panel__header">
        <h2 className="panel__title" id="incident-details-title">
          Incident details
        </h2>
        <button
          type="button"
          className="button"
          onClick={() => close(null)}
          aria-label="Close incident details"
        >
          Close
        </button>
      </div>
      <IncidentCard incident={incident} />
    </aside>
  );
}
