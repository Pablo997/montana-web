'use client';

import { useState } from 'react';
import { INCIDENT_TYPE_LABELS, SEVERITY_LABELS, type Incident } from '@/types/incident';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useClock } from '@/hooks/useClock';
import { getExpiryInfo } from '@/lib/incidents/expiry';
import { FlagIncidentDialog } from './FlagIncidentDialog';
import { IncidentAuthorActions } from './IncidentAuthorActions';
import { IncidentMediaGrid } from './IncidentMediaGrid';
import { IncidentUpdates } from './IncidentUpdates';
import { ShareIncidentButton } from './ShareIncidentButton';
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
  const [flagOpen, setFlagOpen] = useState(false);

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
        <ShareIncidentButton incident={incident} />
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

      <IncidentUpdates incidentId={incident.id} />

      {isAuthor ? (
        <IncidentAuthorActions incident={incident} />
      ) : userId ? (
        // Only offered to signed-in, non-author viewers. Signed-out
        // users don't see it at all (instead of seeing a button that
        // immediately errors) — they discover the feature once they
        // authenticate.
        <div className="incident-card__moderation">
          <button
            type="button"
            className="incident-card__flag"
            onClick={() => setFlagOpen(true)}
          >
            Report this incident
          </button>
        </div>
      ) : null}

      <FlagIncidentDialog
        incidentId={incident.id}
        open={flagOpen}
        onClose={() => setFlagOpen(false)}
      />
    </article>
  );
}
