'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { track } from '@/lib/analytics/track';

/**
 * Forwards every Core Web Vital reported by the browser to our
 * analytics pipeline as a `web_vital` event.
 *
 * Why surface this when `@vercel/speed-insights` is already mounted:
 *
 *   * **Correlation.** SpeedInsights gives us aggregate metrics in
 *     its own dashboard. By ALSO emitting each vital as a custom
 *     analytics event, the same data point joins the funnel where
 *     `incident_report_submitted` and friends live, and we can ask
 *     questions like "does report submission drop when LCP is
 *     `poor`?". Without this, the two dashboards are oil and
 *     water.
 *
 *   * **Cheap-to-stop.** Routing through our wrapper means
 *     `NODE_ENV !== 'production'` already short-circuits dev pings.
 *     `useReportWebVitals` would otherwise console-log on every
 *     local refresh.
 *
 * Cost guard:
 *   * Next.js's hook reports each metric at most TWICE per
 *     navigation (an initial sample, and a final value at unload
 *     for cumulative ones like CLS/INP). On a busy session that's
 *     ≈10 events, well below Vercel's free-tier quota. We
 *     intentionally use the default `reportAllChanges=false`
 *     behaviour — the alternative would emit a tracker hit per
 *     layout shift and incinerate the budget within seconds.
 *
 *   * `value` is stored as an integer to keep the prop shape
 *     scalar-only (matches `AnalyticsEventProps`). CLS, the only
 *     unitless metric, is scaled by 1000 so a real 0.13 lands as
 *     `130` in the funnel — no precision lost, no float keys.
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const rating = ratingFor(metric.name, metric.value);
    // CLS comes back as a small float (0–1). Scale so it survives
    // the int cast. Every other metric is already ms / unitless ms.
    const numeric =
      metric.name === 'CLS' ? Math.round(metric.value * 1000) : Math.round(metric.value);
    track('web_vital', {
      metric: metric.name,
      value: numeric,
      rating,
      // `navigationType` is "navigate" | "reload" | "back-forward"
      // | "prerender" — useful for separating cold loads from
      // warm reloads when triaging regressions.
      navigation_type: metric.navigationType ?? 'unknown',
    });
  });
  return null;
}

/**
 * Bucket the raw metric value into the standard web.dev rating.
 * Thresholds match https://web.dev/articles/vitals (Mar 2024).
 *
 * Buckets are infinitely more useful than raw numbers in a funnel
 * UI — a "LCP=2700" row is noise, but a "LCP=needs-improvement"
 * cohort is actionable.
 */
function ratingFor(
  name: string,
  value: number,
): 'good' | 'needs-improvement' | 'poor' | 'unknown' {
  switch (name) {
    case 'LCP':
      return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor';
    case 'CLS':
      return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor';
    case 'INP':
      return value <= 200 ? 'good' : value <= 500 ? 'needs-improvement' : 'poor';
    case 'FCP':
      return value <= 1800 ? 'good' : value <= 3000 ? 'needs-improvement' : 'poor';
    case 'TTFB':
      return value <= 800 ? 'good' : value <= 1800 ? 'needs-improvement' : 'poor';
    case 'FID':
      return value <= 100 ? 'good' : value <= 300 ? 'needs-improvement' : 'poor';
    default:
      return 'unknown';
  }
}
