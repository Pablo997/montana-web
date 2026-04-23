'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { LOCALES, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from './config';

/**
 * Persist the user's locale choice and invalidate the router cache so
 * the next render sees the new language. Server action so the cookie
 * is set via the proper `Set-Cookie` header instead of doing it from
 * the client (where `document.cookie` doesn't play well with Next's
 * `cookies()` cache, leading to stale RSC on the first navigation
 * after the switch).
 */
export async function setLocale(next: string): Promise<void> {
  if (!LOCALES.includes(next as Locale)) {
    // Reject unknown values silently — a forged payload shouldn't
    // bubble up as a 500 and a localised UI has no notion of an
    // "invalid locale" error message anyway.
    return;
  }

  cookies().set(LOCALE_COOKIE, next, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    // `lax` is enough — the cookie is not a security boundary, we
    // just want browsers to send it back on top-level navigations.
    sameSite: 'lax',
    // Let Vercel/Next handle the secure flag in prod; forcing it in
    // dev would break `http://localhost` testing.
    secure: process.env.NODE_ENV === 'production',
  });

  // Invalidate every RSC that depends on the locale. The layout reads
  // messages via `getMessages()`, so refreshing its segment forces a
  // fresh render tree in the new language.
  revalidatePath('/', 'layout');
}
