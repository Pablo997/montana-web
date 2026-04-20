'use client';

import { INCIDENT_TYPE_LABELS, SEVERITY_LABELS, type Incident } from '@/types/incident';
import { useCurrentUser } from '@/hooks/useCurrentUser';
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
  const isAuthor = userId !== null && userId === incident.userId;

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
        </div>
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
