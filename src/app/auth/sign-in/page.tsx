'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accepted) {
      setError('You must accept the Terms and Privacy Policy to continue.');
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

  return (
    <div className="auth">
      <div className="auth__card">
        <Link href="/" className="auth__back">
          ← Back to map
        </Link>

        <h1 className="auth__title">Sign in to Montana</h1>
        <p className="auth__subtitle">
          We&apos;ll email you a magic link. No password, no hassle.
        </p>

        {status === 'sent' ? (
          <div className="auth__notice auth__notice--success">
            Check <strong>{email}</strong> for a sign-in link.
          </div>
        ) : (
          <form className="auth__form" onSubmit={handleSubmit}>
            <label className="auth__label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="auth__input"
              placeholder="you@example.com"
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
              <span>
                I have read and accept the{' '}
                <Link href="/terms" target="_blank">Terms</Link>,{' '}
                <Link href="/privacy" target="_blank">Privacy Policy</Link>{' '}
                and <Link href="/cookies" target="_blank">Cookie Policy</Link>.
              </span>
            </label>

            <button
              type="submit"
              className="button button--primary auth__submit"
              disabled={status === 'sending' || email.length === 0 || !accepted}
            >
              {status === 'sending' ? 'Sending...' : 'Send magic link'}
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
