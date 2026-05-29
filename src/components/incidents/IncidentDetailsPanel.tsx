'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useMapStore } from '@/store/useMapStore';
import { IncidentCard } from './IncidentCard';

/**
 * Bidirectional sync between `selectedId` and the address bar, using
 * the History API directly instead of Next's router. Why:
 *
 *   * `router.push('/')` would tear down the deep-link page and
 *     re-render the home route — i.e. remount the map, drop the
 *     pin / camera state, and flash a loading state for a panel
 *     close. We want the URL to change WITHOUT a route transition.
 *   * Next 14's App Router has no first-class "shallow routing"
 *     equivalent to the Pages Router `{ shallow: true }` option, so
 *     the canonical workaround is `window.history.{push,replace}State`.
 *   * Wiring `popstate` here means the browser back button closes
 *     the panel (the expected mental model: "back undoes the open").
 *
 * The effect only runs while there *is* a selection, so closing via
 * the in-panel button vs. the back button stays consistent.
 */
function useIncidentUrlSync(selectedId: string | null, close: (id: string | null) => void) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const desiredPath = selectedId ? `/incidents/${selectedId}` : '/';
    if (window.location.pathname !== desiredPath) {
      // `pushState` when opening so the back button has somewhere to
      // go; `replaceState` when closing so we don't litter history
      // with empty entries the user would have to walk through.
      const method = selectedId ? 'pushState' : 'replaceState';
      window.history[method](null, '', desiredPath + window.location.search);
    }

    if (!selectedId) return;

    const onPopState = () => {
      // The user navigated away via back/forward. Whatever the new URL
      // is, the panel should reflect "no selection" so the visible
      // state matches the address bar.
      close(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [selectedId, close]);
}

export function IncidentDetailsPanel() {
  const t = useTranslations('incident.panel');
  const selectedId = useMapStore((s) => s.selectedId);
  const incidents = useMapStore((s) => s.incidents);
  const close = useMapStore((s) => s.select);

  useIncidentUrlSync(selectedId, close);

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
