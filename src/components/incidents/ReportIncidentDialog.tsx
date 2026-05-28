'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useMapStore } from '@/store/useMapStore';
import { IncidentForm } from './IncidentForm';
import { track } from '@/lib/analytics/track';
import type { Incident } from '@/types/incident';

export function ReportIncidentDialog() {
  const t = useTranslations('incident.reportDialog');
  const reportOpen = useMapStore((s) => s.reportOpen);
  const reportLocation = useMapStore((s) => s.reportLocation);
  const closeReport = useMapStore((s) => s.closeReport);
  const startPickingLocation = useMapStore((s) => s.startPickingLocation);
  const setReportLocation = useMapStore((s) => s.setReportLocation);
  const upsertIncident = useMapStore((s) => s.upsertIncident);

  // The dialog only mounts a usable form once it has BOTH the
  // open flag AND a location. We log on each open → ready
  // transition so the funnel is "user committed to opening the
  // report". The ref makes sure subsequent location updates (e.g.
  // the user dragging the pin) don't re-fire the open event.
  const loggedOpenRef = useRef(false);
  useEffect(() => {
    if (!reportOpen || !reportLocation) {
      loggedOpenRef.current = false;
      return;
    }
    if (!loggedOpenRef.current) {
      track('incident_report_opened');
      loggedOpenRef.current = true;
    }
  }, [reportOpen, reportLocation]);

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

  const handleCancel = () => {
    // Counterpart to `incident_report_opened` — distinguishes a
    // close-without-submit (abandoned) from a successful submission
    // which is captured in `IncidentForm` after `createIncident()`.
    track('incident_report_abandoned');
    closeReport();
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={t('dialogLabel')}>
      <button
        type="button"
        className="modal__backdrop"
        onClick={handleCancel}
        aria-label={t('closeDialogAria')}
      />
      <div className="modal__content">
        <header className="modal__header">
          <h2 className="modal__title">{t('title')}</h2>
          <button type="button" className="button" onClick={handleCancel} aria-label={t('closeAria')}>
            ✕
          </button>
        </header>
        <IncidentForm
          location={reportLocation}
          onCreated={handleCreated}
          onCancel={handleCancel}
          onPickLocation={startPickingLocation}
          onLocationChange={setReportLocation}
        />
      </div>
    </div>
  );
}
