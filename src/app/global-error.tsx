'use client';

// Root-level error boundary for the App Router.
//
// This component renders when an error bubbles up past every
// per-route `error.tsx` boundary — i.e. when something in the shared
// layout, providers or server components crashed. Without it, Next
// falls back to a plain white "Application error: a client-side
// exception has occurred" which is both ugly and invisible to our
// monitoring.
//
// Must be a client component and must define its own <html>/<body>
// because it runs *outside* the layout tree.

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem',
          background: '#0f1412',
          color: '#e9efec',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '32rem' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            Something broke up here.
          </h1>
          <p style={{ color: '#9aa8a0', margin: '0 0 1.25rem' }}>
            The error has been reported. You can try again or head back to the map.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
            <button
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
            <a
              href="/"
              style={{
                padding: '0.55rem 1rem',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'transparent',
                color: '#e9efec',
                textDecoration: 'none',
              }}
            >
              Go to map
            </a>
          </div>
          {error.digest ? (
            <p
              style={{
                marginTop: '1.25rem',
                fontSize: '0.75rem',
                color: '#6a7870',
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              ref: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
