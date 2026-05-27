import { test, expect } from '@playwright/test';

/**
 * Locale dispatch smoke for the three legal surfaces (`/privacy`,
 * `/terms`, `/cookies`).
 *
 * What this guards against:
 *   * The per-locale content component (`*Es.tsx` / `*En.tsx`) silently
 *     getting unwired from the `page.tsx` dispatcher.
 *   * Someone hard-coding English copy back into the layout chrome
 *     (e.g. "Last updated:" instead of the localised "Última
 *     actualización:").
 *   * A regression in `src/i18n/request.ts` where the cookie stops
 *     being honoured — would silently fall through to Accept-Language
 *     and the EN check below would fail.
 *
 * We assert one stable, locale-distinguishing string per language
 * instead of a long list — keeps the test fast and avoids brittle
 * coupling to legal copy that may be edited by counsel later.
 */

interface LegalCheck {
  path: string;
  /** A string only present in the Spanish body. */
  esMarker: RegExp;
  /** A string only present in the English body. */
  enMarker: RegExp;
}

const LEGAL_PAGES: LegalCheck[] = [
  {
    path: '/privacy',
    esMarker: /Política de Privacidad/i,
    enMarker: /Privacy Policy/i,
  },
  {
    path: '/terms',
    esMarker: /Términos y Condiciones/i,
    enMarker: /Terms and Conditions/i,
  },
  {
    path: '/cookies',
    esMarker: /Política de Cookies/i,
    enMarker: /Cookie Policy/i,
  },
];

test.describe('legal pages — locale dispatch', () => {
  for (const { path, esMarker, enMarker } of LEGAL_PAGES) {
    test(`${path} renders Spanish body when NEXT_LOCALE=es`, async ({
      context,
      page,
      baseURL,
    }) => {
      await context.addCookies([
        {
          name: 'NEXT_LOCALE',
          value: 'es',
          url: baseURL ?? 'http://localhost:3000',
        },
      ]);
      await page.goto(path);
      // Title lives in the layout chrome (h1). Assert on the h1 so a
      // generic "Política" elsewhere on the page doesn't false-positive.
      await expect(page.locator('h1').first()).toHaveText(esMarker);
    });

    test(`${path} renders English body when NEXT_LOCALE=en`, async ({
      context,
      page,
      baseURL,
    }) => {
      await context.addCookies([
        {
          name: 'NEXT_LOCALE',
          value: 'en',
          url: baseURL ?? 'http://localhost:3000',
        },
      ]);
      await page.goto(path);
      await expect(page.locator('h1').first()).toHaveText(enMarker);
    });
  }
});
