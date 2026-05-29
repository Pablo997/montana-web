/**
 * Centralised event registry for product analytics.
 *
 * Why a single typed registry instead of free-form strings at every
 * call site:
 *
 *   * **Typo-proof.** `track('tour_skipped')` and `track('tour-
 *     skipped')` would otherwise show up as TWO funnels in Vercel
 *     Analytics — silently fragmenting the data and giving wrong
 *     numbers. Centralising forces both producer and consumer
 *     dashboards to agree on the spelling.
 *
 *   * **Auditable.** A reader can scan this file once and know
 *     every signal we collect — useful for the Privacy Policy and
 *     for figuring out what to add/remove during product reviews.
 *
 *   * **PII guardrail.** The `AnalyticsEventProps` payload is
 *     deliberately narrow (`string | number | boolean`). Anything
 *     that could leak personally identifying data — emails, user
 *     ids, exact coordinates, raw user input — gets dropped at the
 *     type system level. Coordinates are bucketed to two decimals
 *     (≈ 1 km) at the call site when needed.
 *
 * We extend this file whenever a new product question needs an
 * answer. Resist the urge to log "everything" — every event eats
 * the free-tier quota and noisier events dilute the signal of the
 * ones that matter.
 */

/**
 * Every event MUST appear here. New events:
 *   1. Add the literal to this union.
 *   2. Document the trigger in a one-line comment so the registry
 *      doubles as a glossary for non-engineers.
 */
export type AnalyticsEvent =
  // ── Onboarding tour ──
  /** The 7-step guided tour started (auto-fired ~1.6 s after first
   *  authenticated mount, NOT when the user clicks "Restart tour"
   *  from /me — that path is `tour_restarted`). */
  | 'tour_started'
  /** User reached the final step and clicked "Get started". */
  | 'tour_completed'
  /** User dismissed the tour. Always paired with a `step` prop so
   *  we can find drop-off points. */
  | 'tour_skipped'
  /** User clicked "Restart tour" from /me Preferences. Separate
   *  from `tour_started` so we can tell the difference between
   *  first-touch onboarding and intentional rewatches. */
  | 'tour_restarted'

  // ── Incident reporting ──
  /** The "Report incident" button was tapped — dialog mounted. */
  | 'incident_report_opened'
  /** Form submission accepted by the API. `type` and `severity`
   *  describe the incident category — both are categorical fields
   *  the user picked from a fixed list, so no PII risk. */
  | 'incident_report_submitted'
  /** User closed the dialog without submitting. Paired with
   *  `furthest_step` so we know which field they bounced off. */
  | 'incident_report_abandoned'

  // ── Map interactions ──
  /** Geocoder produced at least one selectable result. Fired on
   *  pick, not on keystroke, so the count maps to "real" searches. */
  | 'search_used'
  /** User picked a different basemap from the switcher. */
  | 'basemap_changed'
  /** Hillshade overlay toggled on or off. */
  | 'hillshade_toggled'
  /** At least one filter chip applied. Fired when the panel closes
   *  with non-default filters, not on every chip click. */
  | 'filters_applied'

  // ── Auth ──
  /** User chose an authentication method. Lets us measure
   *  Google-vs-magic-link adoption without touching identifiers. */
  | 'signin_method_chosen'

  // ── Engagement ──
  /** Up/down vote cast on an incident. */
  | 'incident_voted'
  /** Flag dialog submitted (user reported an incident). */
  | 'incident_flagged'
  /** Native share or copy-to-clipboard triggered. */
  | 'incident_shared'
  /** Follow-up comment posted on an incident. */
  | 'incident_update_posted'
  /** Author edited their own incident from the detail panel. */
  | 'incident_edited'
  /** Author resolved their own incident. */
  | 'incident_resolved'

  // ── Notifications ──
  /** User completed the push-notification subscription flow. */
  | 'push_subscribed'
  /** User unsubscribed (or revoked permission). */
  | 'push_unsubscribed'

  // ── PWA install ──
  /** The install banner was shown. `mode` distinguishes the native
   *  `beforeinstallprompt` flow from the iOS manual-instructions
   *  fallback so we can measure each platform separately. */
  | 'pwa_install_offered'
  /** User accepted the native install prompt, or the browser fired
   *  `appinstalled`. The funnel pairs with `push_subscribed` to see
   *  whether installed users opt into notifications at a higher rate. */
  | 'pwa_installed'
  /** User dismissed the install banner ("Not now" snooze or the
   *  permanent "x"). Paired with `forever` so we can tell a snooze
   *  from a hard opt-out. */
  | 'pwa_install_dismissed'

  // ── Nearby list ──
  /** User tapped "Use my location" on /nearby. */
  | 'nearby_location_requested'
  /** Nearby list fetch succeeded. */
  | 'nearby_list_loaded'

  // ── Performance ──
  /** A Core Web Vital was reported by the browser. We collapse the
   *  six vitals (LCP, CLS, INP, FCP, TTFB, FID) into a SINGLE event
   *  so the dashboard stays a handful of funnels rather than six
   *  parallel ones. The `metric` prop is the discriminator, paired
   *  with the bucketed `rating` from web.dev's thresholds so we can
   *  segment product events ("LCP good vs. poor") without exposing
   *  raw timings as funnel keys. */
  | 'web_vital';

/**
 * Allowed shape for event properties. Strictly scalar — objects,
 * arrays and Date instances are intentionally NOT allowed because
 * Vercel Analytics would flatten them silently and the resulting
 * dashboard rows would be unreadable.
 *
 * Keep keys short and snake_case to match Vercel's display layer.
 */
export type AnalyticsEventProps = Record<string, string | number | boolean>;

/**
 * Per-event probability of actually being shipped to Vercel.
 *
 * Why sample at the source instead of in the dashboard:
 *
 *   * **Quota.** Vercel's Hobby tier caps at 2.5 k custom events
 *     per month; Pro at 25 k. A single power user can burn 10+
 *     `web_vital` and dozens of `incident_voted` per session, so
 *     unsampled the high-frequency events dominate the budget and
 *     starve the funnels that actually answer product questions.
 *
 *   * **Signal preservation.** Rare events (auth, tour, push) get
 *     `1` so we see every conversion. Frequent-but-aggregated
 *     events (vitals, votes) get a lower rate — the dashboard
 *     still reads stable p50/p95 from a 10–25 % sample once you
 *     have a few hundred sessions.
 *
 * The rates below are calibrated for the Hobby tier. Bump them up
 * the moment we either upgrade or measure that we're consistently
 * under quota. The wrapper exposes a debug escape hatch
 * (`NEXT_PUBLIC_ANALYTICS_FULL_SAMPLE=1`) that bypasses sampling
 * entirely for local QA and Playwright runs.
 */
export const EVENT_SAMPLE_RATES: Partial<Record<AnalyticsEvent, number>> = {
  // High-frequency vitals: 6 per navigation × N navigations adds
  // up quickly. 25 % still gives a defensible cohort for "rating=
  // poor reduces submit rate" within a few weeks.
  web_vital: 0.25,
  // Votes fire on every up/down click — easily 5+ per active
  // session. Direction breakdown is what matters; absolute counts
  // are best read from `incident_voted` + DB aggregates.
  incident_voted: 0.25,
  // Search is medium frequency. Half-sampling still lets us split
  // "result vs. recent" without breaking the bank.
  search_used: 0.5,
  basemap_changed: 0.5,
  hillshade_toggled: 0.5,
  filters_applied: 0.5,
};
