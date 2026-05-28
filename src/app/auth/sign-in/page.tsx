'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher';

type Status = 'idle' | 'sending' | 'sent' | 'error' | 'redirecting';

/** Records the consent click in `localStorage` so we have a
 * client-side evidence trail of when the user accepted the legal
 * notices. Mirrors what the magic-link flow used to do inline —
 * extracted here so OAuth uses the exact same write. */
function persistConsentEvidence(): void {
  try {
    localStorage.setItem(
      'montana.consent',
      JSON.stringify({
        acceptedAt: new Date().toISOString(),
        version: '2026-04',
      }),
    );
  } catch {
    // Storage may be disabled; non-critical. The real binding contract
    // is the auth session created downstream — this is supplementary.
  }
}

export default function SignInPage() {
  const t = useTranslations('auth.signIn');
  const tCommon = useTranslations('common');
  const [email, setEmail] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const requireConsent = (): boolean => {
    if (accepted) return true;
    setError(t('consentRequired'));
    setStatus('error');
    return false;
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requireConsent()) return;
    setStatus('sending');
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signInError) {
      setStatus('error');
      setError(signInError.message);
      return;
    }

    persistConsentEvidence();
    setStatus('sent');
  }

  async function handleGoogleSignIn() {
    if (!requireConsent()) return;
    // The browser is about to leave for accounts.google.com; flip
    // status FIRST so the buttons go disabled and the user can't
    // double-click into a duplicate OAuth flow.
    setStatus('redirecting');
    setError(null);

    // Persist consent BEFORE the redirect — once we hand control over
    // to Google, we won't run again until the callback creates the
    // session, by which point we've already passed the consent gate.
    persistConsentEvidence();

    const supabase = createSupabaseBrowserClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Forces Google to show the account chooser even when the
        // user is already signed in with a single account. Without
        // this, users with one Google session glide straight through
        // without realising they're linking *that specific* account
        // — annoying when you keep separate work / personal logins.
        queryParams: { prompt: 'select_account' },
      },
    });

    if (oauthError) {
      setStatus('error');
      setError(oauthError.message);
    }
    // On success the browser is being redirected; no further action.
  }

  // `t.rich` renders ICU-style tag placeholders (<terms>, <privacy>,
  // <cookies>) as real React elements so we can wrap them in <Link>
  // without string concatenation and without losing translation
  // correctness on the interpolated bits.
  const consent = t.rich('consent', {
    terms: (chunks) => (
      <Link href="/terms" target="_blank">
        {chunks}
      </Link>
    ),
    privacy: (chunks) => (
      <Link href="/privacy" target="_blank">
        {chunks}
      </Link>
    ),
    cookies: (chunks) => (
      <Link href="/cookies" target="_blank">
        {chunks}
      </Link>
    ),
  });

  const sentMessage = t.rich('sent', {
    email,
    strong: (chunks) => <strong>{chunks}</strong>,
  });

  const isBusy = status === 'sending' || status === 'redirecting';

  return (
    <div className="auth">
      <div className="auth__card">
        {/* Top row: back link on the left, language picker on the
            right. This is the first chance an anonymous visitor has
            to switch locale (no header above the auth card) so the
            control HAS to live inside this view. */}
        <div className="auth__topbar">
          <Link href="/" className="auth__back">
            ← {tCommon('backToMap')}
          </Link>
          <LocaleSwitcher />
        </div>

        <h1 className="auth__title">{t('title')}</h1>
        <p className="auth__subtitle">{t('subtitle')}</p>

        {status === 'sent' ? (
          <div className="auth__notice auth__notice--success">{sentMessage}</div>
        ) : (
          <>
            {/* Shared consent first — applies to BOTH Google and
                magic link. Splitting it would force the user to
                tick a box twice when comparing providers. */}
            <label className="auth__consent auth__consent--standalone">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                disabled={isBusy}
                required
              />
              <span>{consent}</span>
            </label>

            <button
              type="button"
              className="auth__google"
              onClick={handleGoogleSignIn}
              disabled={isBusy || !accepted}
              aria-busy={status === 'redirecting'}
            >
              <GoogleLogo />
              <span>
                {status === 'redirecting' ? t('redirecting') : t('googleButton')}
              </span>
            </button>

            <div className="auth__divider" role="separator" aria-label={t('or')}>
              <span>{t('or')}</span>
            </div>

            <form className="auth__form" onSubmit={handleSubmit}>
              <label className="auth__label" htmlFor="email">
                {t('emailLabel')}
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                className="auth__input"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isBusy}
              />

              <button
                type="submit"
                className="button button--primary auth__submit"
                disabled={isBusy || email.length === 0 || !accepted}
              >
                {status === 'sending' ? t('sending') : t('submit')}
              </button>
            </form>

            {status === 'error' && error ? (
              <div className="auth__notice auth__notice--error">{error}</div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Google's official "G" logomark. Inlined as SVG so the button works
 * offline / on slow networks without flashing a missing-image box.
 * Kept exact per Google's brand guidelines — colours and proportions
 * are non-negotiable when displaying the "Sign in with Google" button.
 *
 * Source: https://developers.google.com/identity/branding-guidelines
 */
function GoogleLogo() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
