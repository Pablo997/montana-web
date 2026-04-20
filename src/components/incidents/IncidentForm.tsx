'use client';

import { useState, useTransition } from 'react';
import { createIncident } from '@/lib/incidents/api';
import { compressImage } from '@/lib/utils/image-compression';
import { offlineQueue } from '@/lib/utils/offline-queue';
import {
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
  type CreateIncidentInput,
  type IncidentType,
  type LatLng,
  type SeverityLevel,
} from '@/types/incident';

interface Props {
  location: LatLng;
  onCreated?: () => void;
  onCancel?: () => void;
}

const MAX_PHOTOS = 3;

export function IncidentForm({ location, onCreated, onCancel }: Props) {
  const [type, setType] = useState<IncidentType>('trail_blocked');
  const [severity, setSeverity] = useState<SeverityLevel>('moderate');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFiles = async (list: FileList | null) => {
    if (!list) return;
    const compressed = await Promise.all(
      Array.from(list).slice(0, MAX_PHOTOS).map((f) => compressImage(f)),
    );
    setPhotos(compressed);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const payload: CreateIncidentInput = {
      type,
      severity,
      title: title.trim(),
      description: description.trim() || undefined,
      location,
    };

    if (payload.title.length < 3) {
      setError('Title must be at least 3 characters long.');
      return;
    }

    startTransition(async () => {
      try {
        if (!navigator.onLine) {
          offlineQueue.enqueue(payload);
          onCreated?.();
          return;
        }
        await createIncident(payload);
        // TODO: upload photos to storage under <user_id>/<incident_id>/
        onCreated?.();
      } catch (err) {
        console.error(err);
        offlineQueue.enqueue(payload);
        setError('Could not reach the server. Saved locally and will retry when online.');
      }
    });
  };

  return (
    <form className="incident-form" onSubmit={handleSubmit}>
      <label className="incident-form__field">
        <span>Type</span>
        <select value={type} onChange={(e) => setType(e.target.value as IncidentType)}>
          {Object.entries(INCIDENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="incident-form__field">
        <span>Severity</span>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
        >
          {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="incident-form__field">
        <span>Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          minLength={3}
          maxLength={120}
          required
        />
      </label>

      <label className="incident-form__field">
        <span>Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={4}
        />
      </label>

      <label className="incident-form__field">
        <span>Photos (up to {MAX_PHOTOS})</span>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {error ? <p className="incident-form__error">{error}</p> : null}

      <div className="incident-form__actions">
        {onCancel ? (
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="button button--primary" disabled={isPending}>
          {isPending ? 'Saving…' : 'Report incident'}
        </button>
      </div>
    </form>
  );
}
