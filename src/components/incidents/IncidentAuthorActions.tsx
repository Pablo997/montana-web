'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  deleteIncident,
  resolveIncident,
  updateIncident,
} from '@/lib/incidents/api';
import { UpdateIncidentSchema } from '@/lib/incidents/schemas';
import { useMapStore } from '@/store/useMapStore';
import type { Incident } from '@/types/incident';

interface Props {
  incident: Incident;
}

type Mode = 'idle' | 'editing' | 'confirming-delete';

const DESCRIPTION_MAX = 2000;

/**
 * Author-only actions rendered in the details panel.
 *
 * Three flows live here:
 *   - Edit:      open an inline form to rewrite title + description.
 *                Location / type / severity stay frozen so votes already
 *                cast remain meaningful (see `UpdateIncidentSchema`).
 *   - Resolve:   soft-transition to `resolved`. The row sticks around
 *                in the DB but drops out of the viewport RPCs so it
 *                disappears from every map as soon as the realtime
 *                UPDATE arrives.
 *   - Delete:    hard-delete with cascade on votes + media and a
 *                trigger that cleans Storage blobs. Guarded by a
 *                confirmation step.
 *
 * Resolve and Delete optimistically remove the incident from the store
 * so the panel closes instantly; we roll back on error. Edit is the
 * opposite — it keeps the row visible and only commits the change once
 * the server acknowledges.
 */
export function IncidentAuthorActions({ incident }: Props) {
  const t = useTranslations('incident.details.authorActions');
  const removeIncident = useMapStore((s) => s.removeIncident);
  const upsertIncident = useMapStore((s) => s.upsertIncident);
  const closePanel = useMapStore((s) => s.select);
  const [mode, setMode] = useState<Mode>('idle');
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(incident.title);
  const [description, setDescription] = useState(incident.description ?? '');
  const [isPending, startTransition] = useTransition();

  const resetEditForm = () => {
    setTitle(incident.title);
    setDescription(incident.description ?? '');
    setError(null);
  };

  const openEdit = () => {
    resetEditForm();
    setMode('editing');
  };

  const cancelEdit = () => {
    resetEditForm();
    setMode('idle');
  };

  const run = (action: 'resolve' | 'delete') => {
    setError(null);
    const snapshot = incident;

    removeIncident(incident.id);
    closePanel(null);

    startTransition(async () => {
      try {
        if (action === 'resolve') await resolveIncident(incident.id);
        else await deleteIncident(incident.id);
      } catch (err) {
        console.error(`Failed to ${action} incident`, err);
        upsertIncident(snapshot);
        closePanel(snapshot.id);
        // Server errors (RLS violations, rate limits) may already
        // be localised-enough for the user. If not, we fall back to
        // a generic translated message per action.
        const fallback = action === 'resolve' ? t('resolveError') : t('deleteError');
        setError(err instanceof Error ? err.message : fallback);
      }
    });
  };

  const submitEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = UpdateIncidentSchema.safeParse({
      title,
      description: description.trim().length === 0 ? null : description,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('invalidInput'));
      return;
    }

    // No-op if nothing changed — saves a round-trip and avoids
    // bumping `updated_at` for free.
    const sameTitle = parsed.data.title === incident.title;
    const sameDesc = parsed.data.description === (incident.description ?? null);
    if (sameTitle && sameDesc) {
      setMode('idle');
      return;
    }

    startTransition(async () => {
      try {
        const updated = await updateIncident(incident.id, parsed.data);
        upsertIncident(updated);
        setMode('idle');
      } catch (err) {
        console.error('Failed to update incident', err);
        setError(err instanceof Error ? err.message : t('saveError'));
      }
    });
  };

  if (mode === 'editing') {
    return (
      <form className="author-actions author-actions--edit" onSubmit={submitEdit}>
        <label className="author-actions__field">
          <span className="author-actions__label">{t('titleLabel')}</span>
          <input
            type="text"
            className="author-actions__input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            minLength={3}
            maxLength={120}
            required
            disabled={isPending}
            autoFocus
          />
        </label>

        <label className="author-actions__field">
          <span className="author-actions__label">{t('descriptionLabel')}</span>
          <textarea
            className="author-actions__textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX}
            rows={4}
            disabled={isPending}
            placeholder={t('descriptionPlaceholder')}
          />
          <span className="author-actions__hint">
            {t('counter', { count: description.length, max: DESCRIPTION_MAX })}
          </span>
        </label>

        <div className="author-actions__buttons">
          <button
            type="submit"
            className="button button--primary"
            disabled={isPending}
          >
            {isPending ? t('saving') : t('saveChanges')}
          </button>
          <button
            type="button"
            className="button"
            onClick={cancelEdit}
            disabled={isPending}
          >
            {t('cancel')}
          </button>
        </div>

        {error ? (
          <p role="alert" className="author-actions__error">
            {error}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <div className="author-actions">
      {mode === 'confirming-delete' ? (
        <div className="author-actions__confirm" role="alertdialog">
          <p className="author-actions__confirm-text">{t('deleteConfirm')}</p>
          <div className="author-actions__confirm-buttons">
            <button
              type="button"
              className="button button--danger"
              disabled={isPending}
              onClick={() => run('delete')}
            >
              {t('delete')}
            </button>
            <button
              type="button"
              className="button"
              disabled={isPending}
              onClick={() => setMode('idle')}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="author-actions__buttons">
          <button
            type="button"
            className="button"
            disabled={
              isPending ||
              incident.status === 'resolved' ||
              incident.status === 'dismissed'
            }
            onClick={openEdit}
          >
            {t('edit')}
          </button>
          <button
            type="button"
            className="button"
            disabled={isPending || incident.status === 'resolved'}
            onClick={() => run('resolve')}
          >
            {incident.status === 'resolved' ? t('resolved') : t('resolve')}
          </button>
          <button
            type="button"
            className="button button--ghost-danger"
            disabled={isPending}
            onClick={() => setMode('confirming-delete')}
          >
            {t('delete')}
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
