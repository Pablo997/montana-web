'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DEFAULT_INTERVAL_SECONDS,
  detectBrowserTimezone,
  isValidTimeString,
  loadPreferences,
  refreshSubscriptionStatus,
  subscribe,
  unsubscribe,
  type MinSeverity,
  type PushPreferences,
  type QuietHours,
} from '@/lib/push/client';
import { getCurrentPosition } from '@/lib/utils/geolocation';
import { track } from '@/lib/analytics/track';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fallback center when the user hasn't granted geolocation yet. */
  defaultCenter: { lat: number; lng: number };
  /**
   * Invoked when the user wants to pick their alert center by
   * clicking on the map. The parent is expected to close this modal,
   * drive the map-picker flow, and reopen with `initialCenter` set to
   * the picked coordinates. Optional: if omitted the "Pick on map"
   * button is hidden.
   */
  onPickOnMap?: () => void;
  /**
   * Overrides the center loaded from the DB on mount. Used when the
   * parent re-opens the modal after a successful map pick so the
   * freshly-picked coords are reflected immediately instead of being
   * stomped by the server-side preference load.
   */
  initialCenter?: { lat: number; lng: number } | null;
}

const DEFAULT_PREFS: Omit<PushPreferences, 'center'> = {
  radiusKm: 25,
  minSeverity: 'moderate',
  enabled: true,
  minIntervalSeconds: DEFAULT_INTERVAL_SECONDS,
  // Quiet hours off by default — see the migration comment in
  // 00036_push_quiet_hours.sql for why we don't ship a "sensible
  // default" window. tl;dr: silencing notifications without user
  // consent has a worse failure mode than no DnD at all.
  quietHours: null,
};

/**
 * Defaults the toggle materialises when the user enables DnD for the
 * first time. 23:00–07:00 is the canonical "night" window across
 * cultures and a safer starting point than asking the user to invent
 * one from scratch. They can adjust freely afterwards.
 */
const DEFAULT_QUIET_HOURS: Omit<QuietHours, 'timezone'> = {
  start: '23:00',
  end: '07:00',
  criticalOverride: false,
};

/**
 * Preset cooldown options exposed in the UI. Picking a small set of
 * human-meaningful intervals is more useful than a slider here: nobody
 * wants to fine-tune "every 7 minutes" vs "every 8 minutes", but they
 * do care about the distinction between "as fast as possible" and
 * "maybe hourly". Keep in sync with the CHECK range (60–86400) and
 * with `push.settings.cooldownOptions.*` in the message bundles —
 * the key for each preset IS the value in seconds.
 */
const INTERVAL_PRESETS: readonly number[] = [60, 600, 1800, 3600, 6 * 3600];

const SEVERITY_LEVELS: readonly MinSeverity[] = ['mild', 'moderate', 'severe'];

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
export function NotificationSettings({
  open,
  onClose,
  defaultCenter,
  onPickOnMap,
  initialCenter,
}: Props) {
  const t = useTranslations('push.settings');
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
        // `initialCenter` wins over both the stored prefs and the
        // default: it represents a fresh map pick the user just made,
        // and overwriting it would visibly "snap back" to the old
        // point, which is the opposite of what the UX implies.
        if (initialCenter) {
          setPrefs((p) => ({ ...(saved ?? p), center: initialCenter }));
        } else if (saved) {
          setPrefs(saved);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('loadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `initialCenter` is a deliberate dep: when the parent reopens the
    // modal after a map pick, the effect re-runs and applies the new
    // coords without needing a full remount.
  }, [open, initialCenter, t]);

  const useMyLocation = async () => {
    setError(null);
    try {
      const fix = await getCurrentPosition({ timeoutMs: 10_000 });
      setPrefs((p) => ({ ...p, center: { lat: fix.lat, lng: fix.lng } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('locationError'));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await subscribe(prefs);
      track('push_subscribed');
      setSubscribed(true);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    setSaving(true);
    setError(null);
    try {
      await unsubscribe();
      track('push_unsubscribed');
      setSubscribed(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unsubscribeError'));
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
            {t('title')}
          </h2>
          <button
            type="button"
            className="notification-settings__close"
            onClick={onClose}
            aria-label={t('close')}
          >
            ×
          </button>
        </div>

        {loading ? (
          <p className="notification-settings__status">{t('loading')}</p>
        ) : (
          <>
            <p className="notification-settings__intro">{t('intro')}</p>

            <div className="notification-settings__field">
              <span className="notification-settings__label">{t('centerLabel')}</span>
              <div className="notification-settings__coords">
                {t('centerCoords', {
                  lat: prefs.center.lat.toFixed(4),
                  lng: prefs.center.lng.toFixed(4),
                })}
              </div>
              <div className="notification-settings__center-actions">
                <button
                  type="button"
                  className="button"
                  onClick={useMyLocation}
                  disabled={saving}
                >
                  {t('useMyLocation')}
                </button>
                {onPickOnMap ? (
                  <button
                    type="button"
                    className="button"
                    onClick={onPickOnMap}
                    disabled={saving}
                  >
                    {t('pickOnMap')}
                  </button>
                ) : null}
              </div>
            </div>

            <label className="notification-settings__field">
              <span className="notification-settings__label">
                {t.rich('radiusLabel', {
                  km: prefs.radiusKm,
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
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
                {t('minSeverityLegend')}
              </legend>
              {SEVERITY_LEVELS.map((lvl) => (
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
                  <span>
                    {lvl === 'mild'
                      ? t('severityMild')
                      : lvl === 'moderate'
                        ? t('severityModerate')
                        : t('severitySevere')}
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="notification-settings__field">
              <span className="notification-settings__label">{t('cooldownLabel')}</span>
              <select
                className="notification-settings__select"
                value={prefs.minIntervalSeconds}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    minIntervalSeconds: Number(e.target.value),
                  }))
                }
                disabled={saving}
              >
                {INTERVAL_PRESETS.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {t(`cooldownOptions.${seconds}`)}
                  </option>
                ))}
              </select>
              <p className="notification-settings__hint">{t('cooldownHint')}</p>
            </label>

            <fieldset className="notification-settings__field notification-settings__field--quiet-hours">
              <legend className="notification-settings__label">
                {t('quietHoursLegend')}
              </legend>
              <p className="notification-settings__hint">
                {t('quietHoursDescription')}
              </p>

              <label className="notification-settings__radio">
                <input
                  type="checkbox"
                  checked={prefs.quietHours !== null}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      quietHours: e.target.checked
                        ? {
                            ...DEFAULT_QUIET_HOURS,
                            timezone: detectBrowserTimezone(),
                          }
                        : null,
                    }))
                  }
                  disabled={saving}
                />
                <span>{t('quietHoursToggle')}</span>
              </label>

              {prefs.quietHours ? (
                <div className="notification-settings__quiet-hours">
                  <div className="notification-settings__quiet-hours-times">
                    <label className="notification-settings__quiet-hours-time">
                      <span>{t('quietHoursStart')}</span>
                      <input
                        type="time"
                        value={prefs.quietHours.start}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (!isValidTimeString(next)) return;
                          setPrefs((p) =>
                            p.quietHours
                              ? { ...p, quietHours: { ...p.quietHours, start: next } }
                              : p,
                          );
                        }}
                        disabled={saving}
                        required
                      />
                    </label>
                    <label className="notification-settings__quiet-hours-time">
                      <span>{t('quietHoursEnd')}</span>
                      <input
                        type="time"
                        value={prefs.quietHours.end}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (!isValidTimeString(next)) return;
                          setPrefs((p) =>
                            p.quietHours
                              ? { ...p, quietHours: { ...p.quietHours, end: next } }
                              : p,
                          );
                        }}
                        disabled={saving}
                        required
                      />
                    </label>
                  </div>

                  <p className="notification-settings__hint">
                    {t('quietHoursTimezone', { tz: prefs.quietHours.timezone })}
                  </p>

                  <label className="notification-settings__radio">
                    <input
                      type="checkbox"
                      checked={prefs.quietHours.criticalOverride}
                      onChange={(e) =>
                        setPrefs((p) =>
                          p.quietHours
                            ? {
                                ...p,
                                quietHours: {
                                  ...p.quietHours,
                                  criticalOverride: e.target.checked,
                                },
                              }
                            : p,
                        )
                      }
                      disabled={saving}
                    />
                    <span>{t('quietHoursCriticalOverride')}</span>
                  </label>
                </div>
              ) : null}
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
                  {saving ? t('disabling') : t('disable')}
                </button>
              ) : null}
              <button
                type="button"
                className="button button--primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? t('saving') : subscribed ? t('update') : t('save')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
