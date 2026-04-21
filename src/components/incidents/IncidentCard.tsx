'use client';

import { useState } from 'react';
import { INCIDENT_TYPE_LABELS, SEVERITY_LABELS, type Incident } from '@/types/incident';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useClock } from '@/hooks/useClock';
import { getExpiryInfo } from '@/lib/incidents/expiry';
import { IncidentAuthorActions } from './IncidentAuthorActions';
import { IncidentMediaGrid } from './IncidentMediaGrid';
import { VoteButtons } from './VoteButtons';

interface Props {
  incident: Incident;
}

/**
 * Read-only summary of an incident used inside the details panel. The
 * vote controls are self-contained and manage their own auth, loading
 * and optimistic state. When the viewer is the author we also expose
 * resolve / delete controls below the card.
 */
export function IncidentCard({ incident }: Props) {
  const { userId } = useCurrentUser();
  const now = useClock(60_000);
  const expiry = getExpiryInfo(incident, now);
  const isAuthor = userId !== null && userId === incident.userId;
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    // Built from window.location rather than a hardcoded domain so it
    // works on localhost, previews and production without config.
    const url = `${window.location.origin}/incidents/${incident.id}`;

    // Touch-first: on mobile / tablet the OS share sheet is the right
    // affordance (WhatsApp, Telegram, Messages, etc.). On desktop we
    // skip it on purpose because Chromium leaves an internal "share in
    // progress" flag stuck if the user dismisses the dialog without
    // choosing a target, which silently breaks every subsequent click
    // until the tab is reloaded. The flag is evaluated inside the
    // handler (not at render) to avoid SSR/CSR mismatch on hydration.
    const isTouchDevice =
      'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (isTouchDevice && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: incident.title, url });
        return;
      } catch (err) {
        // AbortError = user cancelled the sheet; nothing to do.
        if ((err as DOMException)?.name === 'AbortError') return;
        // Any other failure (e.g. permission denied) falls through to
        // the clipboard path so the user still walks away with a link.
        console.warn('Native share failed, falling back to clipboard', err);
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Clipboard write failed', err);
    }
  };

  return (
    <article className="incident-card">
      <header className="incident-card__header">
        <h3 className="incident-card__title">{incident.title}</h3>
        <div className="incident-card__badges">
          <span className={`badge badge--${incident.severity}`}>
            {SEVERITY_LABELS[incident.severity]}
          </span>
          <span className="badge badge--type">{INCIDENT_TYPE_LABELS[incident.type]}</span>
          <span className={`badge badge--status-${incident.status}`}>{incident.status}</span>
          {expiry.humanRemaining ? (
            <span
              className={`badge badge--expiry${
                expiry.isExpiringSoon ? ' badge--expiry-soon' : ''
              }`}
              title={`Expires ${new Date(incident.expiresAt!).toLocaleString()}`}
            >
              Expires in {expiry.humanRemaining}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="incident-card__share"
          onClick={handleShare}
          aria-label="Share incident"
        >
          {copied ? 'Link copied!' : 'Share'}
        </button>
      </header>

      {incident.description ? (
        <p className="incident-card__description">{incident.description}</p>
      ) : null}

      {incident.mediaCount > 0 ? (
        <IncidentMediaGrid incidentId={incident.id} expectedCount={incident.mediaCount} />
      ) : null}

      <footer className="incident-card__footer">
        <VoteButtons incident={incident} />
        <time dateTime={incident.createdAt} className="incident-card__description">
          {new Date(incident.createdAt).toLocaleString()}
        </time>
      </footer>

      {isAuthor ? <IncidentAuthorActions incident={incident} /> : null}
    </article>
  );
}
