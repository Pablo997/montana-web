'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function SignInPage() {
  const t = useTranslations('auth.signIn');
  const tCommon = useTranslations('common');
  const [email, setEmail] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accepted) {
      setError(t('consentRequired'));
      setStatus('error');
      return;
    }
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

    // Store the timestamped consent record locally. A more defensive
    // setup would also persist this server-side (e.g. a
    // `user_consents` row) but for the MVP the checkbox click plus
    // this local evidence is sufficient — the real contract is formed
    // when the magic-link callback creates the auth session, which
    // only happens after this consent step.
    try {
      localStorage.setItem(
        'montana.consent',
        JSON.stringify({ acceptedAt: new Date().toISOString(), version: '2026-04' }),
      );
    } catch {
      // Storage may be disabled; non-critical.
    }

    setStatus('sent');
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

  return (
    <div className="auth">
      <div className="auth__card">
        <Link href="/" className="auth__back">
          ← {tCommon('backToMap')}
        </Link>

        <h1 className="auth__title">{t('title')}</h1>
        <p className="auth__subtitle">{t('subtitle')}</p>

        {status === 'sent' ? (
          <div className="auth__notice auth__notice--success">{sentMessage}</div>
        ) : (
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
              disabled={status === 'sending'}
            />

            <label className="auth__consent">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                disabled={status === 'sending'}
                required
              />
              <span>{consent}</span>
            </label>

            <button
              type="submit"
              className="button button--primary auth__submit"
              disabled={status === 'sending' || email.length === 0 || !accepted}
            >
              {status === 'sending' ? t('sending') : t('submit')}
            </button>

            {status === 'error' && error ? (
              <div className="auth__notice auth__notice--error">{error}</div>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
