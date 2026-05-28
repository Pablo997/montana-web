# Analytics

This document is the source of truth for **what we measure**, **why**, and **how to read it**. The implementation lives in `src/lib/analytics/`. This file lives in `docs/` because the *data inventory* is a product/legal artefact, not an engineering one — counsel reads it for the privacy policy, and you'll read it in six months when you've forgotten what `tour_skipped` was supposed to tell you.

## Philosophy

1. **Every event answers ONE product question.** If you can't write the question in a single sentence, the event is noise.
2. **No PII.** Props are `string | number | boolean` only; never ids, emails, raw text, coordinates. The type system enforces it.
3. **Typed registry.** Free-form strings fragment dashboards silently. The `AnalyticsEvent` union in `src/lib/analytics/events.ts` is the single allow-list.
4. **Sampling at the source.** Vercel's Hobby quota is small (2.5 k events/month). High-frequency signals are sampled down so the funnel data stays representative without burning the budget. Conversions are never sampled.

## Stack

| Piece | What it does | Where |
|---|---|---|
| `@vercel/analytics` | Custom events + pageviews | Mounted in `src/app/layout.tsx` as `<Analytics />` |
| `@vercel/speed-insights` | Aggregated Web Vitals (p75 charts) | `<SpeedInsights />` in `layout.tsx` |
| `WebVitalsReporter` | Bridges `next/web-vitals` → custom events so vitals correlate with product funnels | `src/components/analytics/WebVitalsReporter.tsx` |
| `track()` wrapper | Typed entry point with sampling + dev no-op + error swallow | `src/lib/analytics/track.ts` |
| Sentry | Errors, not analytics | See `## Observability` in `README.md` |

## Event registry

> 📍 The full union is in `src/lib/analytics/events.ts`. The table below mirrors it for human readers and adds the *product question* each event exists to answer.

### Onboarding

| Event | Question it answers | Props |
|---|---|---|
| `tour_started` | What % of new authenticated users see the tour? | `total_steps` |
| `tour_completed` | What % finish the tour? | `total_steps` |
| `tour_skipped` | Where do users bail? | `step` (1-indexed), `step_id`, `total_steps` |
| `tour_restarted` | Do existing users come back to rewatch? | — |

### Incident reporting (the conversion funnel)

| Event | Question it answers | Props |
|---|---|---|
| `incident_report_opened` | How many start the funnel? | — |
| `incident_report_submitted` | How many complete it? Which incident types dominate? | `type`, `severity`, `has_photos`, `photo_count` |
| `incident_report_abandoned` | Where do users drop off? | — |

### Map interactions

| Event | Question it answers | Props |
|---|---|---|
| `search_used` | Do users use the geocoder? Recents vs. fresh? | `source: 'result' \| 'recent'` |
| `basemap_changed` | Which basemap do hikers actually pick? | `basemap` |
| `hillshade_toggled` | Is hillshade worth the request cost? | `enabled` |
| `filters_applied` | Do users filter? How many filters per session? | `active_count` |

### Auth

| Event | Question it answers | Props |
|---|---|---|
| `signin_method_chosen` | Magic link vs. Google adoption | `method: 'magic_link' \| 'google'` |

### Engagement

| Event | Question it answers | Props |
|---|---|---|
| `incident_voted` | Up vs. down distribution; vote retraction rate | `direction: 'up' \| 'down' \| 'removed'` |
| `incident_flagged` | Which reasons dominate moderation? | `reason` |
| `incident_shared` | Native share vs. clipboard fallback usage | `method: 'native_share' \| 'clipboard'` |
| `incident_update_posted` | Are users posting follow-ups? | — |
| `incident_edited` | Author-edit rate (for moderation context) | — |
| `incident_resolved` | Author-resolution rate | — |

### Notifications

| Event | Question it answers | Props |
|---|---|---|
| `push_subscribed` | Push opt-in rate | — |
| `push_unsubscribed` | Push attrition | — |

### Performance

| Event | Question it answers | Props |
|---|---|---|
| `web_vital` | Does poor LCP/CLS/INP correlate with lower conversion? | `metric` (LCP\|CLS\|INP\|FCP\|TTFB\|FID), `value` (int, CLS ×1000), `rating` (good\|needs-improvement\|poor\|unknown), `navigation_type` |

## Sampling

Sample rates live in `EVENT_SAMPLE_RATES` (`src/lib/analytics/events.ts`).

| Rate | Events | Why |
|---|---|---|
| **100 %** (default — no entry in map) | All auth, push, report, tour, share, flag, update, edit, resolve | These are conversions or rare signals. Losing even 10 % blinds the funnel. |
| **50 %** | `search_used`, `basemap_changed`, `hillshade_toggled`, `filters_applied` | Medium frequency. Half-sample still gives stable distributions across cohorts. |
| **25 %** | `web_vital`, `incident_voted` | High frequency. A quarter-sample is enough for p50/p95 of vitals and direction split for votes. |

**Bypass for QA**: set `NEXT_PUBLIC_ANALYTICS_FULL_SAMPLE=1`. Useful for Playwright runs that assert on event presence, or for hands-on validation in preview deploys.

**Cost ballpark**: at 500 visitors × 3 sessions/month, current rates yield ~5 k events. Comfortable on Vercel Pro (25 k); over the Hobby cap (2.5 k). If you stay on Hobby, drop `web_vital` and `incident_voted` to `0.1` and you'll land around 3 k.

## Funnels to build in the Vercel dashboard

Once you have ~2 weeks of data, create these as named funnels in Project → Analytics → Funnels. They're the dashboards that turn raw events into product decisions.

1. **Onboarding completion**  
   `tour_started → tour_completed`  
   Healthy: > 60 %. < 40 % means the tour is too long or steps are confusing.

2. **Incident reporting conversion**  
   `incident_report_opened → incident_report_submitted`  
   Healthy: > 50 %. Segment by `severity` of submitted events to spot a UX bottleneck on a specific path.

3. **Auth method preference**  
   Single-event split on `signin_method_chosen.method`. Inform OAuth investment.

4. **Push opt-in rate**  
   `push_subscribed / unique_visitors`. Below 5 % suggests the onboarding banner isn't landing.

5. **Vitals × conversion** (the killer query)  
   Segment `incident_report_submitted` by `web_vital.rating` of the same session. If `rating=poor` drops conversion ≥ 20 %, that page is your next performance investment.

6. **Tour drop-off heatmap**  
   Single-event breakdown on `tour_skipped.step_id`. The mode is the step to redesign or remove.

## Adding a new event

1. **Decide the question first.** Don't ship an event you can't write a question for.
2. Add the literal to the union in `src/lib/analytics/events.ts` and a one-line comment.
3. If high-frequency, add a `EVENT_SAMPLE_RATES` entry.
4. Add a row to **this file** (`docs/ANALYTICS.md`) — that's the privacy-policy-ready surface.
5. Call `track('your_event', { … })` at the relevant call site. The IDE will autocomplete; TypeScript will reject typos.
6. Mention in your PR which funnel the event feeds. Reviewers should push back on events with no consumer.

```ts
import { track } from '@/lib/analytics/track';

// At the point of intent — AFTER the action succeeds, not before.
track('incident_report_submitted', {
  type: created.type,
  severity: created.severity,
  has_photos: photos.length > 0,
  photo_count: photos.length,
});
```

## Privacy & compliance

- The Privacy Policy (`/privacy`) lists Vercel as a sub-processor and points to this taxonomy as the data inventory. Update both when adding events.
- We rely on Vercel's anonymous-by-default analytics — **no cookies are set by `@vercel/analytics`**, so this layer doesn't trigger the cookie banner.
- Sentry events are scrubbed of PII (`sendDefaultPii: false`, custom `beforeSend`) and are observability, not analytics; they live in a separate Sentry org.

## Regression coverage

`tests/e2e/analytics.spec.ts` is a Playwright smoke that proves **our call sites still fire**. It does not test Vercel's transport (their job), only that interacting with the UI produces the right `track()` calls with the right props.

The mechanism: `playwright.config.ts` spawns the dev server with `NEXT_PUBLIC_ANALYTICS_DEBUG=1` so the wrapper writes each call to `console.debug`. The spec listens on `page.on('console')`, parses the structured args through Playwright's `JSHandle.jsonValue()`, and asserts.

Two scenarios are covered today (the highest-ROI map interactions): basemap change and filter close with non-zero count. Auth-gated funnels (`tour_*`, `signin_*`, `push_*`) deliberately stay in the unit tier — running them here would need a real Supabase session and turn a 5-second smoke into a flaky multi-minute saga.

When adding a new event that fronts a critical funnel, add a scenario here. The helper `collectAnalytics(page)` exposes a `waitFor(predicate)` you can chain on.

## Debugging locally

```bash
# Log every event to console.debug without shipping anything.
NEXT_PUBLIC_ANALYTICS_DEBUG=1 npm run dev

# Force full sample for a Playwright run / production preview QA.
NEXT_PUBLIC_ANALYTICS_FULL_SAMPLE=1 npm run start
```

Network panel filter to verify ingestion in production:

```
hostname:vitals.vercel-insights.com OR hostname:va.vercel-scripts.com
```

First-time deploy: events show in the dashboard after ~30 minutes. Custom funnels need at least one matching event before they appear in the picker.

## Anti-patterns we've avoided (don't add these)

- ❌ Logging on every keystroke (search, filters). Sample at the *commit* point (pick, panel close).
- ❌ Putting incident ids in events. The taxonomy is anonymous; the dashboards stay anonymous.
- ❌ Re-emitting the same event with redundant breakdowns. One event + multiple prop keys > five near-identical events.
- ❌ Tracking from a server action. Use `track()` in client code only; server-side metrics belong in Sentry or a real metrics backend (not built yet).
