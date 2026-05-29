import type { BrowserContext } from '@playwright/test';

/**
 * Seeds browser state so map smokes start from a clean, interactive
 * baseline. Called from `beforeEach` BEFORE `page.goto()`.
 */
export async function seedMapTestContext(
  context: BrowserContext,
  baseURL: string,
): Promise<void> {
  await context.addCookies([
    {
      name: 'NEXT_LOCALE',
      value: 'es',
      url: baseURL,
    },
  ]);

  // The legal notice mounts one tick after first paint on a fresh
  // profile. It sits at the bottom with z-index 20 and was
  // intermittently swallowing clicks on the filter toggle (bottom-
  // left). Pre-dismiss so smokes only exercise the control they
  // target, not the notice lifecycle.
  await context.addInitScript(() => {
    try {
      localStorage.setItem(
        'montana.notice.v1',
        JSON.stringify({ dismissedAt: 'e2e' }),
      );
    } catch {
      /* private mode — ignore */
    }
  });
}
