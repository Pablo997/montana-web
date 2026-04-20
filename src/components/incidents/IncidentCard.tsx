import { INCIDENT_TYPE_LABELS, SEVERITY_LABELS, type Incident } from '@/types/incident';
import { VoteButtons } from './VoteButtons';

interface Props {
  incident: Incident;
}

/**
 * Read-only summary of an incident used inside the details panel. The
 * vote controls are self-contained and manage their own auth, loading
 * and optimistic state.
 */
export function IncidentCard({ incident }: Props) {
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

      <footer className="incident-card__footer">
        <VoteButtons incident={incident} />
        <time dateTime={incident.createdAt} className="incident-card__description">
          {new Date(incident.createdAt).toLocaleString()}
        </time>
      </footer>
    </article>
  );
}
