/**
 * i18n configuration.
 *
 * We run `next-intl` in its "without i18n routing" mode: locale is NOT
 * in the URL path, it is resolved from a cookie (`NEXT_LOCALE`) with a
 * fallback to the browser's `Accept-Language` header. URLs stay
 * locale-agnostic (`/incidents/123` works in any language), which is
 * what we want while the product is Spanish-primary and we don't want
 * Google to see a duplicate `/en` tree.
 *
 * If we later decide to go path-based (e.g. to index `/en/...`
 * separately), only this file, `request.ts` and the middleware need
 * to change — call sites using `useTranslations()` stay as-is.
 */

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Default locale served when the user has no preference set. */
export const DEFAULT_LOCALE: Locale = 'es';

/** Cookie name used to persist the user's choice across sessions. */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/**
 * How long the locale cookie lives. One year is standard (matches what
 * Google / most SaaS apps do). A short-lived cookie would re-detect
 * from the browser on every visit which is confusing if the user
 * deliberately switched languages.
 */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Type-narrowing helper: accepts any string, returns a valid Locale. */
export function normaliseLocale(input: string | undefined | null): Locale {
  if (!input) return DEFAULT_LOCALE;
  const lower = input.toLowerCase().split('-')[0];
  return LOCALES.includes(lower as Locale) ? (lower as Locale) : DEFAULT_LOCALE;
}

/**
 * Human-friendly labels for the locale switcher. Kept here (not in the
 * messages JSON) because a label should be written in its OWN language
 * — a user in `en` looking at the switcher should still see "Español",
 * not "Spanish", so they know which option is their native tongue.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
};
