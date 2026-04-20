'use client';

import { useState, useTransition } from 'react';
import { deleteIncident, resolveIncident } from '@/lib/incidents/api';
import { useMapStore } from '@/store/useMapStore';
import type { Incident } from '@/types/incident';

interface Props {
  incident: Incident;
}

/**
 * Author-only actions rendered in the details panel.
 *
 * Two destructive-ish operations live here:
 *   - Resolve:   soft-transition to `resolved`. The row sticks around in
 *                the DB but drops out of the viewport RPCs, so it
 *                disappears from the map for every client as soon as
 *                the realtime UPDATE arrives. Cheap undo is still
 *                possible by flipping the status back via SQL.
 *   - Delete:    hard-delete with cascade on votes + media and a
 *                trigger that removes the associated Storage blobs.
 *                Guarded by a confirmation step.
 *
 * We optimistically remove the incident from the store in both cases so
 * the panel closes instantly. If the RPC fails we re-insert the cached
 * copy and surface the error inline.
 */
export function IncidentAuthorActions({ incident }: Props) {
  const removeIncident = useMapStore((s) => s.removeIncident);
  const upsertIncident = useMapStore((s) => s.upsertIncident);
  const closePanel = useMapStore((s) => s.select);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (action: 'resolve' | 'delete') => {
    setError(null);
    const snapshot = incident;

    // Optimistic close — feels instant and matches what the realtime
    // event will do a moment later anyway.
    removeIncident(incident.id);
    closePanel(null);

    startTransition(async () => {
      try {
        if (action === 'resolve') await resolveIncident(incident.id);
        else await deleteIncident(incident.id);
      } catch (err) {
        console.error(`Failed to ${action} incident`, err);
        // Roll back: put the card back in the store and reopen it so
        // the user can retry without losing context.
        upsertIncident(snapshot);
        closePanel(snapshot.id);
        setError(
          err instanceof Error ? err.message : `Could not ${action} the incident.`,
        );
      }
    });
  };

  return (
    <div className="author-actions">
      {confirmingDelete ? (
        <div className="author-actions__confirm" role="alertdialog">
          <p className="author-actions__confirm-text">
            Delete this incident permanently? Votes and photos will also be removed.
          </p>
          <div className="author-actions__confirm-buttons">
            <button
              type="button"
              className="button button--danger"
              disabled={isPending}
              onClick={() => run('delete')}
            >
              Delete
            </button>
            <button
              type="button"
              className="button"
              disabled={isPending}
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="author-actions__buttons">
          <button
            type="button"
            className="button"
            disabled={isPending || incident.status === 'resolved'}
            onClick={() => run('resolve')}
          >
            {incident.status === 'resolved' ? 'Resolved' : 'Mark as resolved'}
          </button>
          <button
            type="button"
            className="button button--ghost-danger"
            disabled={isPending}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </button>
        </div>
      )}

      {error ? (
        <p role="alert" className="author-actions__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
