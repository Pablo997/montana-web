import type { Incident } from '@/types/incident';

export interface ExpiryInfo {
  /** 0 = expired, 1 = just created. `null` when the incident never expires. */
  lifeRatio: number | null;
  /** Milliseconds until expiry. Negative when already expired, `null` when static. */
  remainingMs: number | null;
  /** True when < 20% of the TTL remains. Used to attenuate / flag markers. */
  isExpiringSoon: boolean;
  /** Compact label like `3d`, `12h`, `25m`. `null` when no TTL. */
  humanRemaining: string | null;
}

const EXPIRING_SOON_THRESHOLD = 0.2;

/**
 * Derives the time-to-live context for an incident.
 *
 * Static features (`water_source`, `shelter`, `point_of_interest`) are
 * stored with `expires_at = null` and get an all-null `ExpiryInfo`, so
 * callers can short-circuit the rendering of "expires in …" hints.
 *
 * Everything else uses the ratio `remaining / total_ttl` to decide when
 * to start warning the user. We avoid `Date.now()` inside React render
 * paths that care about stability; instead callers should memoise with
 * a periodic clock (see `useClock` / manual tick) when they want live
 * updates.
 */
export function getExpiryInfo(incident: Incident, now: number = Date.now()): ExpiryInfo {
  if (!incident.expiresAt) {
    return { lifeRatio: null, remainingMs: null, isExpiringSoon: false, humanRemaining: null };
  }

  const created = new Date(incident.createdAt).getTime();
  const expires = new Date(incident.expiresAt).getTime();
  const total = Math.max(1, expires - created);
  const remaining = expires - now;
  const lifeRatio = Math.max(0, Math.min(1, remaining / total));

  return {
    lifeRatio,
    remainingMs: remaining,
    isExpiringSoon: lifeRatio > 0 && lifeRatio < EXPIRING_SOON_THRESHOLD,
    humanRemaining: remaining > 0 ? formatDuration(remaining) : null,
  };
}

const MS_MINUTE = 60_000;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;

function formatDuration(ms: number): string {
  if (ms >= MS_DAY) return `${Math.round(ms / MS_DAY)}d`;
  if (ms >= MS_HOUR) return `${Math.round(ms / MS_HOUR)}h`;
  if (ms >= MS_MINUTE) return `${Math.round(ms / MS_MINUTE)}m`;
  return '<1m';
}
