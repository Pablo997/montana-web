'use client';

// Internal verification page. Hidden from the nav; link directly to
// /sentry-example-page to smoke-test the SDK after changing the
// Sentry config. The server-side error is thrown from the route
// handler below so both pipelines (client + server) are exercised
// from a single UI.
//
// Safe to keep in production: the client button is inert unless you
// click it, and the /api route is deliberately separate from any
// real endpoint. Remove once you're comfortable Sentry is wired up.

import * as Sentry from '@sentry/nextjs';
import { useState } from 'react';

export default function SentryExamplePage() {
  const [serverState, setServerState] = useState<string | null>(null);

  return (
    <main
      style={{
        maxWidth: 640,
        margin: '4rem auto',
        padding: '0 1.5rem',
        fontFamily: 'system-ui, sans-serif',
        lineHeight: 1.5,
      }}
    >
      <h1 style={{ fontSize: '1.5rem' }}>Sentry verification</h1>
      <p>
        Click the buttons below to send a test event. Check
        <code> sentry.io → Issues</code> a few seconds later.
      </p>

      <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1.5rem' }}>
        <button
          type="button"
          onClick={() => {
            throw new Error(
              'Sentry client test — ' + new Date().toISOString(),
            );
          }}
          style={{ padding: '0.6rem 1rem' }}
        >
          Throw client error
        </button>

        <button
          type="button"
          onClick={() => {
            // Reported but not thrown, so the UI stays usable.
            Sentry.captureMessage(
              'Sentry client captureMessage test — ' + new Date().toISOString(),
              'info',
            );
            setServerState('Client message captured.');
          }}
          style={{ padding: '0.6rem 1rem' }}
        >
          Capture client message
        </button>

        <button
          type="button"
          onClick={async () => {
            setServerState('Calling /api/sentry-example…');
            const res = await fetch('/api/sentry-example');
            setServerState(`Response status: ${res.status}`);
          }}
          style={{ padding: '0.6rem 1rem' }}
        >
          Trigger server error
        </button>
      </div>

      {serverState ? (
        <p style={{ marginTop: '1rem', color: '#2f8f6f' }}>{serverState}</p>
      ) : null}
    </main>
  );
}
