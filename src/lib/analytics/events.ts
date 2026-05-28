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
  | 'push_unsubscribed';

/**
 * Allowed shape for event properties. Strictly scalar — objects,
 * arrays and Date instances are intentionally NOT allowed because
 * Vercel Analytics would flatten them silently and the resulting
 * dashboard rows would be unreadable.
 *
 * Keep keys short and snake_case to match Vercel's display layer.
 */
export type AnalyticsEventProps = Record<string, string | number | boolean>;
