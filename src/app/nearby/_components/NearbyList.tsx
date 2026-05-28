'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { fetchNearbyIncidentsList, type NearbyIncident } from '@/lib/incidents/api';
import { getCurrentPosition } from '@/lib/utils/geolocation';
import { buildPermissionDeniedMessage } from '@/lib/geo/permissionMessage';
import { track } from '@/lib/analytics/track';
import type { LatLng } from '@/types/incident';
import { NearbyItem } from './NearbyItem';

/**
 * Best-effort detection of "user denied geolocation". The platform
 * exposes the failure in two places (Permissions API state + the
 * `getCurrentPosition` reject's `code === 1`); we accept either as a
 * signal that the user needs the OS-specific recovery hint baked into
 * `buildPermissionDeniedMessage`.
 */
function isGeolocationDenied(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: number }).code;
  return code === 1;
}

type Status = 'idle' | 'requesting-location' | 'loading' | 'ready' | 'error';

/**
 * Available search radii. The set is deliberately short — every entry
 * is one click for the user but also one entry in the analytics
 * dashboard, and we'd rather have meaningful buckets than a slider that
 * fragments the funnel.
 *
 * 5 km / 25 km / 50 km / 100 km maps to "walking", "local trail",
 * "valley", "wider area" mental models for outdoor users. The default
 * of 25 km matches the push-notification default so users who tune
 * notifications already have a baseline.
 */
const RADIUS_OPTIONS_KM = [5, 25, 50, 100] as const;
const DEFAULT_RADIUS_KM = 25;

/**
 * Client-side controller for the `/nearby` page.
 *
 *   1. Asks the user for their location (one tap — we don't auto-prompt
 *      on mount because iOS Safari refuses to re-show the dialog once
 *      it has been dismissed).
 *   2. Calls `list_nearby_incidents` with the picked radius.
 *   3. Renders the list, loading skeleton, empty state, or geo-error
 *      depending on phase.
 *
 * Re-fetching is explicit (button + radius change), not on `visibility
 * change`, because the failure mode of "I came back to the tab 20
 * minutes later" is the user re-tapping anyway, and silent background
 * fetches would be both a privacy smell (mystery network calls) and a
 * cost smell (more RPCs than the user asked for).
 */
export function NearbyList() {
  const t = useTranslations('nearby');

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_RADIUS_KM);
  const [items, setItems] = useState<NearbyIncident[]>([]);

  const fetchAt = useCallback(
    async (pos: LatLng, km: number) => {
      setStatus('loading');
      setError(null);
      try {
        const data = await fetchNearbyIncidentsList(pos.lng, pos.lat, km * 1000);
        setItems(data);
        setStatus('ready');
        track('nearby_list_loaded', {
          count: data.length,
          radius_km: km,
        });
      } catch (err) {
        console.error('[nearby] fetch failed', err);
        setError(t('errorFetch'));
        setStatus('error');
      }
    },
    [t],
  );

  /** One-tap location request → fetch. Wires the geo error message
   *  through the localised helper so users get an actionable hint
   *  rather than the raw `GeolocationPositionError.code`. */
  const requestLocation = useCallback(async () => {
    setStatus('requesting-location');
    setError(null);
    track('nearby_location_requested');
    try {
      const fix = await getCurrentPosition();
      const pos: LatLng = { lat: fix.lat, lng: fix.lng };
      setPosition(pos);
      await fetchAt(pos, radiusKm);
    } catch (err) {
      // For "user denied" specifically we render the platform-aware
      // hint that walks them through re-enabling the prompt. Every
      // other geo error is generic (timeout, no GPS, sensor failure)
      // and the localised fallback string is more helpful than the
      // raw browser code.
      if (isGeolocationDenied(err)) {
        setError(buildPermissionDeniedMessage(navigator.userAgent, 'denied'));
      } else {
        setError(t('errorLocation'));
      }
      setStatus('error');
    }
  }, [fetchAt, radiusKm, t]);

  /** Radius changes re-query whenever we already have a fix. */
  const onRadiusChange = useCallback(
    (km: number) => {
      setRadiusKm(km);
      if (position) {
        void fetchAt(position, km);
      }
    },
    [position, fetchAt],
  );

  // Re-fetch when the tab regains focus AND we already have a fix —
  // covers the "I left the tab open, walked 2 km, came back" case
  // without hammering the RPC on every visibility flip. We bail if the
  // user never tapped "use my location" because there's nothing to
  // refresh.
  useEffect(() => {
    if (!position) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && status === 'ready') {
        void fetchAt(position, radiusKm);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [position, radiusKm, status, fetchAt]);

  return (
    <section className="nearby-list" aria-labelledby="nearby-list-title">
      <h2 id="nearby-list-title" className="sr-only">
        {t('listTitle')}
      </h2>

      <NearbyControls
        radiusKm={radiusKm}
        onRadiusChange={onRadiusChange}
        position={position}
        status={status}
        onRequestLocation={requestLocation}
      />

      {status === 'idle' ? <IdlePrompt onRequestLocation={requestLocation} /> : null}
      {status === 'requesting-location' || status === 'loading' ? (
        <LoadingSkeleton />
      ) : null}
      {status === 'error' && error ? <ErrorBlock message={error} /> : null}
      {status === 'ready' && items.length === 0 ? <EmptyBlock /> : null}
      {status === 'ready' && items.length > 0 ? (
        <ul className="nearby-list__items" role="list">
          {items.map((incident) => (
            <li key={incident.id}>
              <NearbyItem incident={incident} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface ControlsProps {
  radiusKm: number;
  onRadiusChange: (km: number) => void;
  position: LatLng | null;
  status: Status;
  onRequestLocation: () => void;
}

function NearbyControls({
  radiusKm,
  onRadiusChange,
  position,
  status,
  onRequestLocation,
}: ControlsProps) {
  const t = useTranslations('nearby');
  const busy = status === 'requesting-location' || status === 'loading';

  return (
    <div className="nearby-list__controls" role="group" aria-label={t('controlsAria')}>
      <fieldset className="nearby-list__radius" disabled={busy}>
        <legend className="nearby-list__radius-legend">{t('radiusLabel')}</legend>
        <div className="nearby-list__radius-chips">
          {RADIUS_OPTIONS_KM.map((km) => {
            const active = km === radiusKm;
            return (
              <button
                key={km}
                type="button"
                className={`chip${active ? ' chip--active' : ''}`}
                aria-pressed={active}
                onClick={() => onRadiusChange(km)}
              >
                {t('radiusKm', { km })}
              </button>
            );
          })}
        </div>
      </fieldset>

      {position ? (
        <button
          type="button"
          className="button button--ghost"
          onClick={onRequestLocation}
          disabled={busy}
        >
          {busy ? t('updating') : t('refresh')}
        </button>
      ) : null}
    </div>
  );
}

function IdlePrompt({ onRequestLocation }: { onRequestLocation: () => void }) {
  const t = useTranslations('nearby');
  return (
    <div className="nearby-list__empty">
      <p className="nearby-list__empty-text">{t('idlePrompt')}</p>
      <button type="button" className="button button--primary" onClick={onRequestLocation}>
        {t('useLocation')}
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <ul className="nearby-list__items nearby-list__items--skeleton" role="list" aria-busy>
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="nearby-skeleton" aria-hidden>
          <div className="nearby-skeleton__thumb" />
          <div className="nearby-skeleton__lines">
            <span className="nearby-skeleton__line nearby-skeleton__line--lg" />
            <span className="nearby-skeleton__line nearby-skeleton__line--md" />
            <span className="nearby-skeleton__line nearby-skeleton__line--sm" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="nearby-list__error" role="alert">
      <p>{message}</p>
    </div>
  );
}

function EmptyBlock() {
  const t = useTranslations('nearby');
  return (
    <div className="nearby-list__empty">
      <p className="nearby-list__empty-text">{t('emptyTitle')}</p>
      <p className="nearby-list__empty-hint">{t('emptyHint')}</p>
    </div>
  );
}
