'use client';

import { useState, useTransition } from 'react';
import { createIncident } from '@/lib/incidents/api';
import { CreateIncidentSchema, type CreateIncidentInput } from '@/lib/incidents/schemas';
import { compressImage } from '@/lib/utils/image-compression';
import { offlineQueue } from '@/lib/utils/offline-queue';
import { watchBestFix } from '@/lib/utils/geolocation';
import {
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
  type Incident,
  type IncidentType,
  type LatLng,
  type SeverityLevel,
} from '@/types/incident';

interface Props {
  location: LatLng;
  onCreated?: (incident: Incident | null) => void;
  onCancel?: () => void;
  onPickLocation?: () => void;
  onLocationChange?: (location: LatLng) => void;
}

const MAX_PHOTOS = 3;

export function IncidentForm({
  location,
  onCreated,
  onCancel,
  onPickLocation,
  onLocationChange,
}: Props) {
  const [type, setType] = useState<IncidentType>('trail_blocked');
  const [severity, setSeverity] = useState<SeverityLevel>('moderate');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoAccuracy, setGeoAccuracy] = useState<number | null>(null);

  const handleFiles = async (list: FileList | null) => {
    if (!list) return;
    const compressed = await Promise.all(
      Array.from(list).slice(0, MAX_PHOTOS).map((f) => compressImage(f)),
    );
    setPhotos(compressed);
  };

  const handleUseMyLocation = async () => {
    if (!onLocationChange) return;
    setGeoLoading(true);
    setError(null);
    setGeoAccuracy(null);
    try {
      const best = await watchBestFix({
        windowMs: 6000,
        targetAccuracy: 10,
        onProgress: (fix) => {
          // Update the map in real-time as GPS refines its solution.
          onLocationChange({ lat: fix.lat, lng: fix.lng });
          setGeoAccuracy(fix.accuracy);
        },
      });
      onLocationChange({ lat: best.lat, lng: best.lng });
      setGeoAccuracy(best.accuracy);
    } catch {
      setError('Could not read your location. Try picking on the map.');
    } finally {
      setGeoLoading(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const result = CreateIncidentSchema.safeParse({
      type,
      severity,
      title,
      description,
      location,
    });

    if (!result.success) {
      // Show the first field error; tiny form so we don't need per-field
      // wiring yet. Upgrade to react-hook-form + zodResolver if this grows.
      const first = result.error.issues[0];
      setError(first?.message ?? 'Invalid form.');
      return;
    }

    const payload: CreateIncidentInput = result.data;

    startTransition(async () => {
      try {
        if (!navigator.onLine) {
          offlineQueue.enqueue(payload);
          onCreated?.(null);
          return;
        }
        const created = await createIncident(payload);
        // TODO: upload photos to storage under <user_id>/<incident_id>/
        onCreated?.(created);
      } catch (err) {
        console.error(err);
        offlineQueue.enqueue(payload);
        setError('Could not reach the server. Saved locally and will retry when online.');
      }
    });
  };

  return (
    <form className="incident-form" onSubmit={handleSubmit}>
      <div className="incident-form__location">
        <div>
          <span className="incident-form__label">Location</span>
          <span className="incident-form__coords">
            {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
          </span>
          {geoAccuracy !== null ? (
            <small className="incident-form__hint">
              {geoLoading ? 'Refining…' : 'Accuracy'}: ±{Math.round(geoAccuracy)} m
            </small>
          ) : null}
        </div>
        <div className="incident-form__location-actions">
          {onLocationChange ? (
            <button
              type="button"
              className="button"
              onClick={handleUseMyLocation}
              disabled={geoLoading}
            >
              {geoLoading ? 'Locating…' : 'Use my location'}
            </button>
          ) : null}
          {onPickLocation ? (
            <button type="button" className="button" onClick={onPickLocation}>
              Pick on map
            </button>
          ) : null}
        </div>
      </div>

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
        {photos.length > 0 ? (
          <small className="incident-form__hint">
            {photos.length} photo{photos.length > 1 ? 's' : ''} ready (upload coming soon).
          </small>
        ) : null}
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
