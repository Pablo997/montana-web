'use client';

import { useState } from 'react';
import { DEFAULT_CENTER } from '@/lib/mapbox/config';
import { subscribe } from '@/lib/push/client';
import { getCurrentPosition } from '@/lib/utils/geolocation';
import { usePushOnboarding } from '@/hooks/usePushOnboarding';

/**
 * First-visit nudge inviting the signed-in user to enable Web Push for
 * nearby incidents. Purely additive: the full preferences UI in
 * `NotificationSettings` stays the source of truth for fine-grained
 * configuration, and any user who dismisses the banner (snooze or
 * forever) can still reach that modal from the account menu.
 *
 * Lifecycle is owned by `usePushOnboarding`: this component only
 * renders, wires the two primary actions to `subscribe()`, and lets
 * the hook persist the outcome.
 */

const DEFAULT_RADIUS_KM = 25;
const DEFAULT_MIN_SEVERITY = 'moderate' as const;
/**
 * Cap the geolocation attempt so the banner never feels stuck. If the
 * user hasn't granted location, we fall back to the map default and
 * let them fine-tune from the settings modal later.
 */
const GEO_TIMEOUT_MS = 6000;

export function PushOnboardingBanner() {
  const { visible, snooze, dismissForever, markAccepted } = usePushOnboarding();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  const handleEnable = async () => {
    setSubmitting(true);
    setError(null);
    try {
      let center = { lat: DEFAULT_CENTER[1], lng: DEFAULT_CENTER[0] };
      try {
        const fix = await getCurrentPosition({ timeoutMs: GEO_TIMEOUT_MS });
        center = { lat: fix.lat, lng: fix.lng };
      } catch {
        // Geolocation refused or timed out: keep the default center.
        // The user can pick a precise point from the settings modal
        // once they're set up; a failed geo fix is not a reason to
        // abort the whole opt-in.
      }
      await subscribe({
        center,
        radiusKm: DEFAULT_RADIUS_KM,
        minSeverity: DEFAULT_MIN_SEVERITY,
        enabled: true,
      });
      markAccepted();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not enable notifications. Try again from the account menu.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <aside
      className="push-onboarding"
      role="region"
      aria-label="Nearby alerts onboarding"
    >
      <span className="push-onboarding__icon" aria-hidden>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15L6 17Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M10 20a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </span>

      <div className="push-onboarding__copy">
        <p className="push-onboarding__heading">
          Get alerts for nearby incidents
        </p>
        <p className="push-onboarding__body">
          Hear about new reports in your area without having to open the app.
        </p>
        {error ? (
          <p className="push-onboarding__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="push-onboarding__actions">
        <button
          type="button"
          className="button"
          onClick={snooze}
          disabled={submitting}
        >
          Not now
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={handleEnable}
          disabled={submitting}
        >
          {submitting ? 'Enabling…' : 'Turn on'}
        </button>
      </div>

      <button
        type="button"
        className="push-onboarding__dismiss"
        onClick={dismissForever}
        aria-label="Don’t ask again"
        title="Don’t ask again"
        disabled={submitting}
      >
        ×
      </button>
    </aside>
  );
}
