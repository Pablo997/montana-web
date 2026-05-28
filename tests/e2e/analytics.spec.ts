import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';

/**
 * Smoke tests for the analytics taxonomy.
 *
 * The goal is NOT to verify Vercel Analytics' transport — that's
 * their responsibility — but to pin down that **our call sites
 * fire the events they're supposed to fire**, with the props the
 * dashboards expect. A regression here is invisible until product
 * looks at a funnel weeks later and notices it's empty.
 *
 * How we detect calls:
 *   * The wrapper at `src/lib/analytics/track.ts` is a no-op in
 *     production builds when not deployed, but in dev it
 *     `console.debug`s every call when
 *     `NEXT_PUBLIC_ANALYTICS_DEBUG=1` is set. Playwright spawns
 *     the dev server with that env var (see `playwright.config.ts`)
 *     so we capture the debug stream from `page.on('console', …)`
 *     and assert against it.
 *   * This bypasses Vercel's network endpoint entirely. We don't
 *     care whether Vercel received the event — we care that our
 *     CODE asked for it. Mocking the wrong layer is a classic
 *     analytics-test failure mode.
 *
 * What we deliberately do NOT test here:
 *   * Auth-gated events (`signin_method_chosen`, `tour_*`,
 *     `push_*`) require a real Supabase session. They're covered
 *     by unit tests at the call sites; bolting them on here would
 *     turn a 5-second smoke into a flaky multi-minute saga.
 *   * `web_vital`: LCP timings differ wildly between CI and local;
 *     the unit test in `WebVitalsReporter.test.tsx` already pins
 *     the bucketing, which is what matters.
 *
 * What we DO test: the two pure-UI events that have the highest
 * ROI for the dashboard (map interaction funnels). If these regress
 * silently, the product loses visibility into how users navigate
 * the map.
 */

interface CapturedEvent {
  event: string;
  // Props are typed as unknown at the boundary because they round-
  // trip through JSON-stringified console output. Tests cast to the
  // shapes they care about.
  props: Record<string, unknown>;
}

/**
 * Start listening for `track()` debug logs BEFORE the page navigates
 * so we don't miss anything that fires during mount (`tour_started`
 * et al., though those are auth-gated and won't appear here).
 *
 * Returns a live array — push-mutated as events arrive — plus a
 * `waitFor` helper that polls until a predicate matches or the
 * Playwright `expect` timeout elapses.
 */
function collectAnalytics(page: Page) {
  const events: CapturedEvent[] = [];

  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() !== 'debug') return;
    // The wrapper logs as `console.debug('[analytics]', eventName,
    // propsObject)`. Playwright stringifies objects in `text()` to
    // something like `JSHandle@object`, so we have to reach for the
    // handle args instead and `jsonValue()` each one — that round-
    // trips through `structuredClone` semantics and gives us the
    // actual primitive payload.
    const args = msg.args();
    if (args.length < 2) return;

    void (async () => {
      try {
        const prefix = (await args[0].jsonValue()) as unknown;
        if (prefix !== '[analytics]') return;
        const event = (await args[1].jsonValue()) as string;
        const props =
          args.length > 2
            ? ((await args[2].jsonValue()) as Record<string, unknown>)
            : {};
        events.push({ event, props });
      } catch {
        // Page closed mid-readout — drop silently. The `waitFor`
        // poll below will surface "event never arrived" if it
        // actually mattered.
      }
    })();
  };

  page.on('console', onConsole);

  return {
    events,
    /** Polls until `predicate` matches an event, or `expect` times out. */
    waitFor: async (predicate: (e: CapturedEvent) => boolean) => {
      await expect
        .poll(() => events.some(predicate), {
          message: `expected an analytics event matching predicate; captured: ${JSON.stringify(events)}`,
        })
        .toBe(true);
      return events.find(predicate)!;
    },
  };
}

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([
    {
      name: 'NEXT_LOCALE',
      value: 'es',
      url: baseURL ?? 'http://localhost:3000',
    },
  ]);
});

test.describe('analytics call sites', () => {
  test('basemap switcher emits basemap_changed with the picked id', async ({ page }) => {
    const analytics = collectAnalytics(page);
    await page.goto('/');

    const toggle = page.getByRole('button', { name: /Capas del mapa/i });
    await toggle.click();

    // The active basemap is marked with `aria-pressed=true`. We pick
    // the FIRST option that ISN'T currently active — guarantees a
    // real change (the wrapper short-circuits no-op selections) and
    // doesn't hardcode any specific basemap id (the curated set is
    // allowed to evolve).
    const inactive = page
      .getByRole('dialog')
      .getByRole('button', { pressed: false })
      .first();
    await inactive.click();

    const captured = await analytics.waitFor((e) => e.event === 'basemap_changed');
    // `basemap` is the only required prop; we don't assert on its
    // specific value because that's coupled to the curated list.
    expect(typeof captured.props.basemap).toBe('string');
    expect((captured.props.basemap as string).length).toBeGreaterThan(0);
  });

  test('filter panel emits filters_applied on close with active_count', async ({
    page,
  }) => {
    const analytics = collectAnalytics(page);
    await page.goto('/');

    const toggle = page.getByRole('button', { name: /Incidencias/i }).first();
    await toggle.click();

    // Activate one type chip (default state has all types implicitly
    // selected via `filters.types = null`; toggling one flips it to
    // a non-null array, so `computeActiveCount` jumps from 0 → 1).
    const firstChip = page.locator('.filter-panel__chips .chip').first();
    await firstChip.click();

    // Close the panel by re-clicking the toggle. The event fires on
    // open → close transitions, not on every chip toggle, so we
    // wouldn't see anything until this point.
    await toggle.click();

    const captured = await analytics.waitFor((e) => e.event === 'filters_applied');
    // `active_count` must be > 0; the event would not have fired
    // otherwise (the wrapper inside FilterPanel guards against
    // closing with zero active filters to keep the dashboard clean).
    expect(captured.props.active_count).toBeGreaterThan(0);
  });
});
