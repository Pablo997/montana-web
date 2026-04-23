import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility smoke tests driven by axe-core.
 *
 * Why we keep this separate from `smoke.spec.ts`:
 *
 *   * Smokes exist to prove "the app boots at all" and should stay
 *     green even on a cold preview. A11y audits are allowed to fail
 *     when we regress — they're a *budget*, not a liveness check.
 *   * Keeping them separate lets us tune axe's rule set per-route
 *     without contaminating the main smoke file.
 *
 * What we assert:
 *
 *   * No violations at the `critical` or `serious` level. WCAG2 A/AA
 *     rules are the tag filter; level AAA is explicitly out of scope
 *     because nobody passes AAA on a real product and it gives us
 *     false signal.
 *   * Moderate / minor violations are logged to the test output but
 *     don't fail the suite. They still show up in CI logs so they're
 *     visible, just not blocking.
 *
 * Known exclusions:
 *
 *   * `.maplibregl-map` — MapLibre renders its tiles into a <canvas>
 *     that axe rightly flags for missing semantics, but there's no
 *     meaningful a11y tree to expose for a map raster. We rely on
 *     the surrounding UI (search, filters, incident list, keyboard
 *     flight controls) for non-visual access.
 *   * `.maplibregl-ctrl-bottom-right` — MapLibre's own attribution
 *     control. Owned by the library, not fixable here.
 */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const EXCLUDE_SELECTORS = ['.maplibregl-map', '.maplibregl-ctrl-bottom-right'];

async function audit(page: import('@playwright/test').Page) {
  return new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    .exclude(EXCLUDE_SELECTORS)
    .analyze();
}

function blocking(violations: Awaited<ReturnType<typeof audit>>['violations']) {
  return violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
}

function summarise(violations: Awaited<ReturnType<typeof audit>>['violations']) {
  return violations
    .map((v) => `  [${v.impact ?? 'unknown'}] ${v.id} — ${v.help} (${v.nodes.length}x)`)
    .join('\n');
}

test('home page has no critical or serious a11y violations', async ({ page }) => {
  await page.goto('/');
  const { violations } = await audit(page);
  const bad = blocking(violations);
  if (bad.length > 0) {
    console.log(`\n[a11y] Home — blocking violations:\n${summarise(bad)}\n`);
  }
  // Log moderate / minor for visibility without failing.
  const softer = violations.filter((v) => v.impact === 'moderate' || v.impact === 'minor');
  if (softer.length > 0) {
    console.log(`[a11y] Home — non-blocking:\n${summarise(softer)}`);
  }
  expect(bad, `Blocking a11y violations on /\n${summarise(bad)}`).toEqual([]);
});

test('sign-in page has no critical or serious a11y violations', async ({ page }) => {
  await page.goto('/auth/sign-in');
  const { violations } = await audit(page);
  const bad = blocking(violations);
  if (bad.length > 0) {
    console.log(`\n[a11y] Sign-in — blocking violations:\n${summarise(bad)}\n`);
  }
  expect(bad, `Blocking a11y violations on /auth/sign-in\n${summarise(bad)}`).toEqual([]);
});

test('legal pages have no critical or serious a11y violations', async ({ page }) => {
  for (const path of ['/privacy', '/terms', '/cookies']) {
    await page.goto(path);
    const { violations } = await audit(page);
    const bad = blocking(violations);
    if (bad.length > 0) {
      console.log(`\n[a11y] ${path} — blocking violations:\n${summarise(bad)}\n`);
    }
    expect(bad, `Blocking a11y violations on ${path}\n${summarise(bad)}`).toEqual([]);
  }
});
