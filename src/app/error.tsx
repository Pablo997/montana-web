'use client';

// Route-level error boundary for the App Router.
//
// This catches everything that `global-error.tsx` wouldn't: i.e.
// errors that happened *inside* the shared layout tree after the
// providers mounted. We keep it visually lighter than global-error
// because the user is still on the same app shell — we're not
// recovering from a full-tree collapse, just a per-page failure.
//
// Sentry reporting is redundant with the Next.js `onRequestError`
// hook on the server side, but not on the client side, so we report
// explicitly here.

import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { useEffect } from 'react';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: '32rem' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
          This page hit an error
        </h1>
        <p style={{ color: 'var(--color-text-muted, #9aa8a0)', marginBottom: '1.25rem' }}>
          It&apos;s been reported. Retry, or go back to the map.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '0.55rem 1rem',
              borderRadius: 8,
              border: '1px solid #2f8f6f',
              background: '#2f8f6f',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <Link
            href="/"
            style={{
              padding: '0.55rem 1rem',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent',
              textDecoration: 'none',
            }}
          >
            Go to map
          </Link>
        </div>
        {error.digest ? (
          <p
            style={{
              marginTop: '1.25rem',
              fontSize: '0.75rem',
              color: 'var(--color-text-muted, #6a7870)',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            ref: {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
