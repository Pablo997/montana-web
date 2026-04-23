'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  REPORT_REASONS,
  ReportError,
  reportIncident,
  type ReportReason,
} from '@/lib/incidents/reports';

interface Props {
  incidentId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Community reporting dialog. Uses the `report_incident` RPC which is
 * rate-limited server-side, self-idempotent and enforces the "can't
 * report your own incident" rule, so the client only needs to collect
 * the reason + optional free-text and surface error messages.
 *
 * Kept separate from `ReportIncidentDialog` (which is the *create*
 * dialog) on purpose: the UX, validation and state needs are entirely
 * different, and colocating them would force either prop explosion or
 * a confusing conditional tree.
 */
export function FlagIncidentDialog({ incidentId, open, onClose }: Props) {
  const t = useTranslations('incident.flag');
  const { userId } = useCurrentUser();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason('spam');
    setDetails('');
    setError(null);
    setSuccess(false);
    setSubmitting(false);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  if (!userId) {
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label={t('dialogLabel')}>
        <button
          type="button"
          className="modal__backdrop"
          onClick={onClose}
          aria-label={t('closeDialogAria')}
        />
        <div className="modal__content">
          <header className="modal__header">
            <h2 className="modal__title">{t('title')}</h2>
            <button type="button" className="button" onClick={onClose} aria-label={t('closeAria')}>
              ✕
            </button>
          </header>
          <p className="incident-form__hint">{t('signInPrompt')}</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await reportIncident(incidentId, reason, details);
      setSuccess(true);
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      // ReportError carries a stable `code` we translate locally — the
      // server message is English-only and not user-friendly for other
      // locales. Unknown errors fall back to the generic copy.
      let msg = t('genericError');
      if (err instanceof ReportError && err.code !== 'unknown') {
        msg = t(`errors.${err.code}`);
      }
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={t('dialogLabel')}>
      <button
        type="button"
        className="modal__backdrop"
        onClick={onClose}
        aria-label={t('closeDialogAria')}
      />
      <div className="modal__content">
        <header className="modal__header">
          <h2 className="modal__title">{t('title')}</h2>
          <button type="button" className="button" onClick={onClose} aria-label={t('closeAria')}>
            ✕
          </button>
        </header>

        {success ? (
          <p className="incident-form__hint">{t('thanks')}</p>
        ) : (
          <form className="incident-form" onSubmit={handleSubmit}>
            <label className="incident-form__field">
              <span>{t('reasonLabel')}</span>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as ReportReason)}
                disabled={submitting}
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {t(`reasons.${r.value}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="incident-form__field">
              <span>{t('detailsLabel')}</span>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder={t('detailsPlaceholder')}
                disabled={submitting}
              />
              <small className="incident-form__hint">{t('detailsHint')}</small>
            </label>

            {error ? <p className="incident-form__error">{error}</p> : null}

            <div className="incident-form__actions">
              <button
                type="button"
                className="button"
                onClick={onClose}
                disabled={submitting}
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="button button--primary"
                disabled={submitting}
              >
                {submitting ? t('submitting') : t('submit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
