import { track as vercelTrack } from '@vercel/analytics';
import type { AnalyticsEvent, AnalyticsEventProps } from './events';

/**
 * Thin, typed wrapper over Vercel Analytics' `track()`.
 *
 * Design choices:
 *
 *   * **Never throw.** Analytics is observability, not business
 *     logic. If the Vercel script failed to load (ad-blocker,
 *     offline, dev), `vercelTrack` is a no-op anyway — the wrapper
 *     just adds a safety net so a refactor in `@vercel/analytics`
 *     can never crash a user-visible flow.
 *
 *   * **Server-side guard.** Every call site is "use client", but
 *     the bundle still resolves on the server during SSR. The
 *     `typeof window` check short-circuits before touching any
 *     browser-only globals.
 *
 *   * **Dev mode opt-out.** Vercel's SDK doesn't ship pageviews in
 *     dev by default, but `track()` events DO fire. We squelch them
 *     so local clicks don't pollute the prod funnels. To debug
 *     locally, set `NEXT_PUBLIC_ANALYTICS_DEBUG=1` and the wrapper
 *     console-logs each event instead.
 *
 * The wrapper takes the strictly-typed `AnalyticsEvent` literal so
 * the IDE autocompletes the known events and TypeScript blocks
 * typos at compile time. See `./events.ts` for the registry.
 */
export function track(
  event: AnalyticsEvent,
  props?: AnalyticsEventProps,
): void {
  if (typeof window === 'undefined') return;

  if (process.env.NODE_ENV !== 'production') {
    if (process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === '1') {
      // Visible-only-in-dev log so engineers can verify call sites
      // without polluting the prod console.
      // eslint-disable-next-line no-console
      console.debug('[analytics]', event, props ?? {});
    }
    return;
  }

  try {
    vercelTrack(event, props);
  } catch {
    /* Analytics must never break a user flow. */
  }
}
