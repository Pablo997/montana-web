import { test, expect } from '@playwright/test';

/**
 * Smoke tests: "does the app boot at all?".
 *
 * We intentionally keep these shallow so they stay green against a
 * cold Vercel preview without needing Supabase seed data or a
 * logged-in user. Deeper flows belong in an integration suite that
 * can spin up a Supabase test project.
 */

test('home page renders the map shell with brand and controls', async ({ page }) => {
  await page.goto('/');

  // Brand wordmark in the floating header. Using role=link scoped
  // to the logo area instead of getByText so we don't trip over any
  // "Montana" string elsewhere (e.g. a footer).
  await expect(page.getByRole('link', { name: /Montana home/i })).toBeVisible();

  // The report button lives in the bottom-right overlay. Its
  // existence proves the map view mounted — MapLibre itself is too
  // network-dependent to assert against reliably in smokes.
  await expect(page.getByRole('button', { name: /Report/i })).toBeVisible();
});

test('sign-in page shows the magic-link form and requires consent', async ({ page }) => {
  await page.goto('/auth/sign-in');

  await expect(
    page.getByRole('heading', { name: /Sign in to Montana/i }),
  ).toBeVisible();

  const emailInput = page.getByLabel(/Email/i);
  await expect(emailInput).toBeVisible();
  await emailInput.fill('hiker@example.com');

  // Submit must be disabled until the consent checkbox is ticked:
  // this is load-bearing for GDPR compliance, so guard it in a test.
  const submit = page.getByRole('button', { name: /Send magic link/i });
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
