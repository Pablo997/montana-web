'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  createIncidentUpdate,
  deleteMyIncidentUpdate,
  fetchIncidentUpdates,
  UpdateRateLimitError,
} from '@/lib/incidents/updates/api';
import type { IncidentUpdate } from '@/lib/incidents/updates/types';
import { CreateIncidentUpdateSchema } from '@/lib/incidents/updates/schemas';

interface Props {
  incidentId: string;
}

const MAX_BODY = 500;

/**
 * Flat chronological follow-up thread pinned to the bottom of an
 * incident card. Signed-in users post new lines, authors of each line
 * can delete their own, and everyone can read.
 *
 * Design rationale:
 *   - Ordered oldest → newest so the latest update sits closest to
 *     the compose box, which is where the user's eye is when they're
 *     about to reply. (The classic Slack / Discord chrome.)
 *   - Optimistic insert: the post appears instantly with a `pending`
 *     flag and is reconciled when the server returns. Failure rolls
 *     the row back and keeps the draft in the textarea so the user
 *     can retry without retyping.
 *   - No threading, no edits — see migration 00032 for the product
 *     reasoning. Add comments locally if the scope grows.
 */
export function IncidentUpdates({ incidentId }: Props) {
  const { userId, loading: authLoading } = useCurrentUser();

  const [updates, setUpdates] = useState<IncidentUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const rows = await fetchIncidentUpdates(incidentId);
      setUpdates(rows);
    } catch (err) {
      console.error('[IncidentUpdates] load failed', err);
      setLoadError(
        err instanceof Error ? err.message : 'Could not load follow-ups.',
      );
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);

    const parsed = CreateIncidentUpdateSchema.safeParse({ body: draft });
    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? 'Invalid input.');
      return;
    }
    if (!userId) {
      setSubmitError('You need to sign in to post follow-ups.');
      return;
    }

    // Optimistic insert keyed with a temp id so the render stays stable
    // even if two quick submits happen back-to-back.
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: IncidentUpdate = {
      id: tempId,
      incidentId,
      userId,
      username: null,
      body: parsed.data.body,
      createdAt: new Date().toISOString(),
    };
    setUpdates((prev) => [...prev, optimistic]);
    setDraft('');

    startSubmit(async () => {
      try {
        await createIncidentUpdate(incidentId, parsed.data);
        // Refetch the thread so we pick up the real username from the
        // `profiles` join in `list_incident_updates`. The INSERT path
        // can't resolve usernames without an extra round-trip anyway,
        // so one GET here keeps the code simple and shows accurate
        // attribution immediately.
        await load();
      } catch (err) {
        console.error('[IncidentUpdates] submit failed', err);
        setUpdates((prev) => prev.filter((u) => u.id !== tempId));
        setDraft(parsed.data.body);
        setSubmitError(
          err instanceof UpdateRateLimitError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not post the update.',
        );
      }
    });
  };

  const remove = (id: string) => {
    // Snapshot for rollback. Optimistic remove feels much better than
    // a spinner on a small inline button.
    const snapshot = updates;
    setUpdates((prev) => prev.filter((u) => u.id !== id));

    startSubmit(async () => {
      try {
        await deleteMyIncidentUpdate(id);
      } catch (err) {
        console.error('[IncidentUpdates] delete failed', err);
        setUpdates(snapshot);
        setSubmitError(
          err instanceof Error ? err.message : 'Could not delete the update.',
        );
      }
    });
  };

  return (
    <section className="incident-updates" aria-label="Incident follow-ups">
      <header className="incident-updates__head">
        <h4 className="incident-updates__title">Follow-ups</h4>
        <span className="incident-updates__count">
          {updates.length > 0 ? `${updates.length}` : ''}
        </span>
      </header>

      {loading ? (
        <p className="incident-updates__status">Loading…</p>
      ) : loadError ? (
        <p role="alert" className="incident-updates__error">
          {loadError}
        </p>
      ) : updates.length === 0 ? (
        <p className="incident-updates__status">
          No follow-ups yet. Be the first to post a status check.
        </p>
      ) : (
        <ol className="incident-updates__list">
          {updates.map((u) => {
            const isMine = userId !== null && userId === u.userId;
            // Show "You" while the optimistic row hasn't been reconciled
            // yet (the INSERT doesn't resolve usernames; we refetch
            // right after) to avoid a jarring "Unknown" flash.
            const authorLabel = u.username ?? (isMine ? 'You' : 'Unknown');
            const canDelete = isMine && !u.id.startsWith('temp-');
            return (
              <li key={u.id} className="incident-updates__item">
                <div className="incident-updates__meta">
                  <span className="incident-updates__author">{authorLabel}</span>
                  <time
                    dateTime={u.createdAt}
                    className="incident-updates__time"
                    title={u.createdAt}
                  >
                    {formatRelative(u.createdAt)}
                  </time>
                </div>
                <p className="incident-updates__body">{u.body}</p>
                {canDelete ? (
                  <div className="incident-updates__actions">
                    <button
                      type="button"
                      className="incident-updates__delete"
                      onClick={() => remove(u.id)}
                      disabled={isSubmitting}
                      aria-label="Delete this follow-up"
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {authLoading ? null : userId ? (
        <form className="incident-updates__form" onSubmit={submit}>
          <label className="incident-updates__field">
            <span className="sr-only">New follow-up</span>
            <textarea
              className="incident-updates__textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_BODY}
              rows={2}
              placeholder="Add a status check, correction, or update…"
              disabled={isSubmitting}
            />
          </label>
          <div className="incident-updates__form-foot">
            <span className="incident-updates__counter">
              {draft.length}/{MAX_BODY}
            </span>
            <button
              type="submit"
              className="button button--primary"
              disabled={isSubmitting || draft.trim().length === 0}
            >
              {isSubmitting ? 'Posting…' : 'Post'}
            </button>
          </div>
          {submitError ? (
            <p role="alert" className="incident-updates__error">
              {submitError}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="incident-updates__status incident-updates__status--muted">
          Sign in to post a follow-up.
        </p>
      )}
    </section>
  );
}

/**
 * Human-readable relative time ("3 min ago", "2 h ago") that degrades
 * to an absolute datetime once the event is older than 24h. Kept inline
 * because we only use it here — promote to a util if another surface
 * needs the same rules.
 */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} h ago`;
  return new Date(iso).toLocaleString();
}
