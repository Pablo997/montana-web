import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, normaliseLocale } from './config';

/**
 * Server-side locale resolver + message loader.
 *
 * Runs on every request to an RSC that uses `useTranslations()` /
 * `getTranslations()`. Resolution order:
 *
 *   1. `NEXT_LOCALE` cookie — explicit user choice, wins over
 *      anything else. Set by the locale switcher.
 *   2. `Accept-Language` request header — the browser's preferred
 *      language list. We pick the first entry the browser sends
 *      and normalise it (`es-ES` → `es`). If it's not in our list,
 *      we fall through.
 *   3. Default (`es`).
 *
 * Messages are loaded lazily per-locale via dynamic import so each
 * RSC bundle only pulls the strings it actually uses. `messages/*.json`
 * are not imported eagerly in `page.tsx` — all access goes through
 * `useTranslations()` / `getTranslations()` which read from the
 * context set up by this function.
 */
export default getRequestConfig(async () => {
  const cookieStore = cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  let locale = normaliseLocale(cookieLocale);

  // Honour Accept-Language only when the user hasn't picked explicitly
  // yet. Otherwise a user who switched to English would keep getting
  // Spanish whenever their browser's default is Spanish — the explicit
  // cookie choice must beat the browser.
  if (!cookieLocale) {
    const hdrs = headers();
    const accept = hdrs.get('accept-language');
    if (accept) {
      const first = accept.split(',')[0]?.trim();
      locale = normaliseLocale(first);
    } else {
      locale = DEFAULT_LOCALE;
    }
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Use the server's wall clock as the "now" reference so relative
    // times (`5 minutes ago`) render consistently across RSC + client.
    now: new Date(),
    // Europe/Madrid is where the product operates; using a fixed zone
    // prevents "Invalid Date" drift when the server runs in UTC and
    // the client in local time.
    timeZone: 'Europe/Madrid',
  };
});
