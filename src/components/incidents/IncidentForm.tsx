'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { RateLimitError, createIncident, uploadIncidentMedia } from '@/lib/incidents/api';
import { CreateIncidentSchema, type CreateIncidentInput } from '@/lib/incidents/schemas';
import { compressImage } from '@/lib/utils/image-compression';
import { offlineQueue } from '@/lib/utils/offline-queue';
import { watchBestFix } from '@/lib/utils/geolocation';
import { useIncidentLabels } from '@/lib/incidents/useIncidentLabels';
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
  const t = useTranslations('incident.form');
  const labels = useIncidentLabels();
  const [type, setType] = useState<IncidentType>('trail_blocked');
  const [severity, setSeverity] = useState<SeverityLevel>('moderate');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoAccuracy, setGeoAccuracy] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

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
          onLocationChange({ lat: fix.lat, lng: fix.lng });
          setGeoAccuracy(fix.accuracy);
        },
      });
      onLocationChange({ lat: best.lat, lng: best.lng });
      setGeoAccuracy(best.accuracy);
    } catch {
      setError(t('locationError'));
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
      //
      // Zod error messages themselves still come from the schemas and
      // may be English — translating those is a follow-up (would need
      // a zod error-map at the schema boundary, not free).
      const first = result.error.issues[0];
      setError(first?.message ?? t('invalid'));
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
        let uploadedCount = 0;

        if (photos.length > 0) {
          setUploadStatus(t('uploading', { done: 0, total: photos.length }));
          let done = 0;
          const results = await Promise.allSettled(
            photos.map((file) =>
              uploadIncidentMedia(created, file).finally(() => {
                done += 1;
                setUploadStatus(t('uploading', { done, total: photos.length }));
              }),
            ),
          );
          uploadedCount = results.filter((r) => r.status === 'fulfilled').length;
          const failed = results.length - uploadedCount;
          if (failed > 0) {
            console.error(
              'Some photos failed to upload',
              results.filter((r) => r.status === 'rejected'),
            );
            setError(t('photosPartialFail', { failed }));
          }
          setUploadStatus(null);
        }

        onCreated?.({ ...created, mediaCount: uploadedCount });
      } catch (err) {
        console.error(err);
        if (err instanceof RateLimitError) {
          setError(err.message);
          return;
        }
        offlineQueue.enqueue(payload);
        setError(t('offlineQueued'));
      }
    });
  };

  return (
    <form className="incident-form" onSubmit={handleSubmit}>
      <div className="incident-form__location">
        <div>
          <span className="incident-form__label">{t('locationLabel')}</span>
          <span className="incident-form__coords">
            {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
          </span>
          {geoAccuracy !== null ? (
            <small className="incident-form__hint">
              {geoLoading ? t('refining') : t('accuracy')}: ±{Math.round(geoAccuracy)} m
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
              {geoLoading ? t('locating') : t('useMyLocation')}
            </button>
          ) : null}
          {onPickLocation ? (
            <button type="button" className="button" onClick={onPickLocation}>
              {t('pickOnMap')}
            </button>
          ) : null}
        </div>
      </div>

      <label className="incident-form__field">
        <span>{t('typeLabel')}</span>
        <select value={type} onChange={(e) => setType(e.target.value as IncidentType)}>
          {(Object.keys(INCIDENT_TYPE_LABELS) as IncidentType[]).map((value) => (
            <option key={value} value={value}>
              {labels.type(value)}
            </option>
          ))}
        </select>
      </label>

      <label className="incident-form__field">
        <span>{t('severityLabel')}</span>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
        >
          {(Object.keys(SEVERITY_LABELS) as SeverityLevel[]).map((value) => (
            <option key={value} value={value}>
              {labels.severity(value)}
            </option>
          ))}
        </select>
      </label>

      <label className="incident-form__field">
        <span>{t('titleLabel')}</span>
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
        <span>{t('descriptionLabel')}</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={4}
        />
      </label>

      <label className="incident-form__field">
        <span>{t('photosLabel', { max: MAX_PHOTOS })}</span>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
        {photos.length > 0 ? (
          <small className="incident-form__hint">
            {uploadStatus ?? t('photosReady', { count: photos.length })}
          </small>
        ) : null}
      </label>

      {error ? <p className="incident-form__error">{error}</p> : null}

      <div className="incident-form__actions">
        {onCancel ? (
          <button type="button" className="button" onClick={onCancel}>
            {t('cancel')}
          </button>
        ) : null}
        <button type="submit" className="button button--primary" disabled={isPending}>
          {isPending ? t('submitting') : t('submit')}
        </button>
      </div>
    </form>
  );
}
