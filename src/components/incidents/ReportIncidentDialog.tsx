'use client';

import { useEffect } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { IncidentForm } from './IncidentForm';
import type { Incident } from '@/types/incident';

export function ReportIncidentDialog() {
  const reportOpen = useMapStore((s) => s.reportOpen);
  const reportLocation = useMapStore((s) => s.reportLocation);
  const closeReport = useMapStore((s) => s.closeReport);
  const startPickingLocation = useMapStore((s) => s.startPickingLocation);
  const setReportLocation = useMapStore((s) => s.setReportLocation);
  const upsertIncident = useMapStore((s) => s.upsertIncident);

  useEffect(() => {
    if (!reportOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeReport();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reportOpen, closeReport]);

  if (!reportOpen || !reportLocation) return null;

  const handleCreated = (incident: Incident | null) => {
    if (incident) upsertIncident(incident);
    closeReport();
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Report incident">
      <button
        type="button"
        className="modal__backdrop"
        onClick={closeReport}
        aria-label="Close dialog"
      />
      <div className="modal__content">
        <header className="modal__header">
          <h2 className="modal__title">Report an incident</h2>
          <button type="button" className="button" onClick={closeReport} aria-label="Close">
            ✕
          </button>
        </header>
        <IncidentForm
          location={reportLocation}
          onCreated={handleCreated}
          onCancel={closeReport}
          onPickLocation={startPickingLocation}
          onLocationChange={setReportLocation}
        />
      </div>
    </div>
  );
}
