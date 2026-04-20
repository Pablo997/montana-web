'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

            <button
              type="submit"
              className="button button--primary auth__submit"
              disabled={status === 'sending' || email.length === 0}
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
