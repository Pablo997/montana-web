'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Incident } from '@/types/incident';
import { buildIncidentSharePayload } from '@/lib/share/shareUrl';

interface Props {
  incident: Incident;
  className?: string;
}

type ShareState = 'idle' | 'copied' | 'error';

const RESET_DELAY_MS = 1500;

/**
 * Share affordance for an incident. Auto-detects the best available
 * transport:
 *
 *   1. On touch devices with `navigator.share`, open the OS share
 *      sheet. Users expect to send the link to WhatsApp / Messages /
 *      etc. without leaving the app.
 *   2. Otherwise (desktop, or browsers without Web Share API) copy
 *      the URL to the clipboard and flash a confirmation.
 *
 * We explicitly skip the native sheet on desktop Chromium because it
 * leaves an internal "share in progress" flag stuck when the dialog
 * is dismissed, which silently breaks every subsequent click until
 * the tab is reloaded. The touch check is evaluated inside the
 * handler so SSR and the first client render produce identical HTML.
 */
export function ShareIncidentButton({ incident, className }: Props) {
  const [state, setState] = useState<ShareState>('idle');
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleReset = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setState('idle');
      resetTimerRef.current = null;
    }, RESET_DELAY_MS);
  }, []);

  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const handleClick = useCallback(async () => {
    const payload = buildIncidentSharePayload(
      incident,
      window.location.origin,
    );

    const isTouchDevice =
      'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (isTouchDevice && typeof navigator.share === 'function') {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        // User cancelled the sheet: silent, not an error.
        if ((err as DOMException)?.name === 'AbortError') return;
        // Any other failure (e.g. NotAllowedError without a user
        // gesture) falls through to the clipboard path so the user
        // still walks away with a link.
        console.warn('Native share failed, falling back to clipboard', err);
      }
    }

    try {
      await navigator.clipboard.writeText(payload.url);
      setState('copied');
      scheduleReset();
    } catch (err) {
      console.error('Clipboard write failed', err);
      setState('error');
      scheduleReset();
    }
  }, [incident, scheduleReset]);

  const label =
    state === 'copied'
      ? 'Link copied!'
      : state === 'error'
        ? 'Copy failed'
        : 'Share';

  return (
    <button
      type="button"
      className={className ?? 'incident-card__share'}
      onClick={handleClick}
      aria-label="Share incident"
    >
      {label}
    </button>
  );
}
