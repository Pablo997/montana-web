'use client';

import { useTranslations } from 'next-intl';
import { useMapStore } from '@/store/useMapStore';
import { IncidentCard } from './IncidentCard';

export function IncidentDetailsPanel() {
  const t = useTranslations('incident.panel');
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
          {t('title')}
        </h2>
        <button
          type="button"
          className="button"
          onClick={() => close(null)}
          aria-label={t('closeAriaLabel')}
        >
          {t('close')}
        </button>
      </div>
      <IncidentCard incident={incident} />
    </aside>
  );
}
