import { test, expect } from '@playwright/test';

/**
 * UI behaviour tests for the map overlays.
 *
 * These exist specifically to pin down recent regressions that were
 * painful to debug from manual QA alone:
 *
 *   1. The geocoder search bar must start COLLAPSED on mobile.
 *      Previously the React state defaulted to `expanded=true`, so
 *      the SSR HTML rendered the full bar on every device and mobile
 *      viewports flashed it across the brand header until the
 *      `useEffect` hydrated and collapsed it.
 *
 *   2. The filter panel and basemap switcher must open and close on
 *      click — a regression here is invisible from screenshots but
 *      breaks the primary discovery flows.
 *
 * They run only in Chromium because the bugs they catch are not
 * engine-specific and an extra browser doubles CI time for no
 * marginal coverage.
 */

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([
    {
      name: 'NEXT_LOCALE',
      value: 'es',
      url: baseURL ?? 'http://localhost:3000',
    },
  ]);
});

test.describe('search bar — mobile collapses to icon by default (no SSR flash)', () => {
  // Override the desktop default with an iPhone-class viewport.
  // We can't use `devices['iPhone 13']` here because that flips
  // `defaultBrowserType` to webkit which Playwright forbids inside a
  // describe block. The viewport alone is what triggers the CSS
  // breakpoint that drove the original bug, so this is enough.
  test.use({ viewport: { width: 390, height: 844 } });

  test('renders only the trigger icon, not the expanded search input', async ({ page }) => {
    await page.goto('/');

    // The trigger button is labelled via i18n; assert against the
    // Spanish label so we also catch the case where the bundle key
    // is renamed without updating the component.
    const trigger = page.getByRole('button', { name: /Abrir búsqueda de lugares/i });
    await expect(trigger).toBeVisible();

    // The expanded combobox MUST NOT be present at first paint on
    // mobile. We assert visibility (display: none counts) rather
    // than DOM presence — the new design renders both nodes and
    // hides the wrong one via CSS @media.
    const combobox = page.getByRole('combobox');
    await expect(combobox).toBeHidden();
  });

  test('tapping the trigger expands the bar and focuses the input', async ({ page }) => {
    await page.goto('/');

    const trigger = page.getByRole('button', { name: /Abrir búsqueda de lugares/i });
    await trigger.click();

    const input = page.getByRole('searchbox');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });
});

test.describe('filter panel toggle', () => {
  test('opens and closes when its trigger is clicked', async ({ page }) => {
    await page.goto('/');

    // "Incidencias" is the Spanish label of the filter toggle; the
    // button also carries aria-expanded which is what we actually
    // assert against.
    const toggle = page.getByRole('button', { name: /Incidencias/i }).first();
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('basemap switcher toggle', () => {
  test('opens and closes when its trigger is clicked', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByRole('button', { name: /Capas del mapa/i });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // The panel exposes a list of basemaps. We don't assert against
    // specific ids because the curated set is allowed to evolve;
    // proving "something rendered" inside the panel is enough.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
