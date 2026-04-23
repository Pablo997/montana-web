import { test, expect } from '@playwright/test';

/**
 * Smoke tests: "does the app boot at all?".
 *
 * We intentionally keep these shallow so they stay green against a
 * cold Vercel preview without needing Supabase seed data or a
 * logged-in user. Deeper flows belong in an integration suite that
 * can spin up a Supabase test project.
 *
 * All assertions are written against the **Spanish** locale because
 * that's the product default. The smokes therefore double as a
 * sanity check on the `es.json` message bundle — if a key is missing
 * or mistyped, the visible string won't match and the test fails.
 *
 * **CI / GitHub Actions:** the Playwright browser sends an English
 * `Accept-Language` by default, and our i18n resolver prefers that
 * over the app default when no cookie is set. We seed `NEXT_LOCALE=es`
 * in `beforeEach` so smokes are deterministic on every host.
 *
 * If you need to exercise the English bundle, set the `NEXT_LOCALE=en`
 * cookie before navigating — see the last test in this file for the
 * pattern. There is no dedicated EN smoke yet because the one here
 * catches the 90% case (bundle loads, provider wires up correctly)
 * regardless of locale.
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

test('home page renders the map shell with brand and controls', async ({ page }) => {
  await page.goto('/');

  // Brand wordmark in the floating header. Using role=link scoped
  // to the logo area instead of getByText so we don't trip over any
  // "Montana" string elsewhere (e.g. a footer).
  await expect(page.getByRole('link', { name: /Ir al inicio de Montana/i })).toBeVisible();

  // The report button lives in the bottom-right overlay. Its
  // existence proves the map view mounted — MapLibre itself is too
  // network-dependent to assert against reliably in smokes.
  await expect(page.getByRole('button', { name: /Reportar/i })).toBeVisible();
});

test('sign-in page shows the magic-link form and requires consent', async ({ page }) => {
  await page.goto('/auth/sign-in');

  await expect(
    page.getByRole('heading', { name: /Inicia sesión en Montana/i }),
  ).toBeVisible();

  const emailInput = page.getByLabel(/Email/i);
  await expect(emailInput).toBeVisible();
  await emailInput.fill('hiker@example.com');

  // Submit must be disabled until the consent checkbox is ticked:
  // this is load-bearing for GDPR compliance, so guard it in a test.
  const submit = page.getByRole('button', { name: /Enviar enlace mágico/i });
  await expect(submit).toBeDisabled();

  await page.getByRole('checkbox').check();
  await expect(submit).toBeEnabled();
});

test('legal pages are reachable and not 404', async ({ page }) => {
  for (const path of ['/privacy', '/terms', '/cookies']) {
    const response = await page.goto(path);
    expect(response?.status(), `GET ${path}`).toBeLessThan(400);
    // Each legal page has an <h1>. Not asserting exact text so the
    // copy can evolve without breaking this test.
    await expect(page.locator('h1').first()).toBeVisible();
  }
});

test('switching locale via cookie renders the English bundle', async ({ context, page, baseURL }) => {
  // Locale is cookie-driven (no routing prefix) so we seed the cookie
  // directly instead of wiring up a UI switcher click. This proves the
  // provider reacts to the request-scoped locale resolution in
  // src/i18n/request.ts — the bit that would silently regress if
  // someone swaps cookie-based for path-based routing later.
  //
  // `baseURL` comes from Playwright config (http://localhost:3000 by
  // default) — we use it instead of `page.url()` because a pristine
  // test tab starts on about:blank, and addCookies refuses to attach
  // a cookie to a non-HTTP URL.
  await context.addCookies([
    {
      name: 'NEXT_LOCALE',
      value: 'en',
      url: baseURL ?? 'http://localhost:3000',
    },
  ]);

  await page.goto('/auth/sign-in');

  await expect(
    page.getByRole('heading', { name: /Sign in to Montana/i }),
  ).toBeVisible();
});
