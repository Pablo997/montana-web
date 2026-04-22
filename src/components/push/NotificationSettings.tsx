'use client';

import { useEffect, useState } from 'react';
import {
  loadPreferences,
  refreshSubscriptionStatus,
  subscribe,
  unsubscribe,
  type MinSeverity,
  type PushPreferences,
} from '@/lib/push/client';
import { getCurrentPosition } from '@/lib/utils/geolocation';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fallback center when the user hasn't granted geolocation yet. */
  defaultCenter: { lat: number; lng: number };
}

const DEFAULT_PREFS: Omit<PushPreferences, 'center'> = {
  radiusKm: 25,
  minSeverity: 'moderate',
  enabled: true,
};

/**
 * Modal that owns the full "nearby alerts" flow: permission prompt,
 * center acquisition, preference editing and the RPC round-trip.
 *
 * Kept in one component because splitting the happy path across
 * multiple routes/modals would multiply the failure modes (three
 * possible `Notification.permission` states × two possible geolocation
 * states × DB/network errors). A single state machine inside one
 * component is easier to reason about.
 */
export function NotificationSettings({ open, onClose, defaultCenter }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [prefs, setPrefs] = useState<PushPreferences>({
    ...DEFAULT_PREFS,
    center: defaultCenter,
  });

  // Load the persisted prefs when opened. Short-circuits when the
  // modal is closed so we don't hit the network until the user
  // actually wants this panel.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [saved, status] = await Promise.all([
          loadPreferences(),
          refreshSubscriptionStatus(),
        ]);
        if (cancelled) return;
        setSubscribed(Boolean(saved?.enabled) && status.subscribedInBrowser);
        if (saved) setPrefs(saved);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load settings.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const useMyLocation = async () => {
    setError(null);
    try {
      const fix = await getCurrentPosition({ timeoutMs: 10_000 });
      setPrefs((p) => ({ ...p, center: { lat: fix.lat, lng: fix.lng } }));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not read your location. Check browser permissions.',
      );
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await subscribe(prefs);
      setSubscribed(true);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    setSaving(true);
    setError(null);
    try {
      await unsubscribe();
      setSubscribed(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unsubscribe.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="notification-settings"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-settings__title"
    >
      <div
        className="notification-settings__backdrop"
        onClick={onClose}
        aria-hidden
      />
      <div className="notification-settings__panel">
        <div className="notification-settings__header">
          <h2 id="notification-settings__title" className="notification-settings__title">
            Nearby alerts
          </h2>
          <button
            type="button"
            className="notification-settings__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {loading ? (
          <p className="notification-settings__status">Loading…</p>
        ) : (
          <>
            <p className="notification-settings__intro">
              Get a push notification when a new incident is reported within
              your area. You can change or disable this any time.
            </p>

            <div className="notification-settings__field">
              <span className="notification-settings__label">Center</span>
              <div className="notification-settings__coords">
                {prefs.center.lat.toFixed(4)}, {prefs.center.lng.toFixed(4)}
              </div>
              <button
                type="button"
                className="button"
                onClick={useMyLocation}
                disabled={saving}
              >
                Use my current location
              </button>
            </div>

            <label className="notification-settings__field">
              <span className="notification-settings__label">
                Radius: <strong>{prefs.radiusKm} km</strong>
              </span>
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                value={prefs.radiusKm}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, radiusKm: Number(e.target.value) }))
                }
                disabled={saving}
              />
            </label>

            <fieldset className="notification-settings__field">
              <legend className="notification-settings__label">
                Minimum severity
              </legend>
              {(['mild', 'moderate', 'severe'] as MinSeverity[]).map((lvl) => (
                <label key={lvl} className="notification-settings__radio">
                  <input
                    type="radio"
                    name="min-severity"
                    value={lvl}
                    checked={prefs.minSeverity === lvl}
                    onChange={() =>
                      setPrefs((p) => ({ ...p, minSeverity: lvl }))
                    }
                    disabled={saving}
                  />
                  <span style={{ textTransform: 'capitalize' }}>{lvl}</span>
                </label>
              ))}
            </fieldset>

            {error ? (
              <p className="notification-settings__error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="notification-settings__actions">
              {subscribed ? (
                <button
                  type="button"
                  className="button button--danger"
                  onClick={handleDisable}
                  disabled={saving}
                >
                  {saving ? 'Turning off…' : 'Turn off notifications'}
                </button>
              ) : null}
              <button
                type="button"
                className="button button--primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving
                  ? 'Saving…'
                  : subscribed
                    ? 'Update settings'
                    : 'Enable notifications'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
