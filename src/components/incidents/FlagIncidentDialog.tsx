'use client';

import { useEffect, useState } from 'react';
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

  // Guard on the client too: the server is authoritative but a signed-out
  // user should never even see the submit button firing.
  if (!userId) {
    return (
      <div className="modal" role="dialog" aria-modal="true" aria-label="Report incident">
        <button
          type="button"
          className="modal__backdrop"
          onClick={onClose}
          aria-label="Close dialog"
        />
        <div className="modal__content">
          <header className="modal__header">
            <h2 className="modal__title">Report this incident</h2>
            <button type="button" className="button" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </header>
          <p className="incident-form__hint">Sign in to report incidents.</p>
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
      // Auto-close after a short confirmation so the user gets visible
      // feedback without an extra click.
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      const msg =
        err instanceof ReportError
          ? err.message
          : 'Could not submit the report. Please try again.';
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Report incident">
      <button
        type="button"
        className="modal__backdrop"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div className="modal__content">
        <header className="modal__header">
          <h2 className="modal__title">Report this incident</h2>
          <button type="button" className="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {success ? (
          <p className="incident-form__hint">
            Thanks — your report has been submitted and will be reviewed.
          </p>
        ) : (
          <form className="incident-form" onSubmit={handleSubmit}>
            <label className="incident-form__field">
              <span>Reason</span>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as ReportReason)}
                disabled={submitting}
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="incident-form__field">
              <span>Details (optional)</span>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="Anything a reviewer should know…"
                disabled={submitting}
              />
              <small className="incident-form__hint">
                We share reports only with our moderation team. Do not include
                personal data.
              </small>
            </label>

            {error ? <p className="incident-form__error">{error}</p> : null}

            <div className="incident-form__actions">
              <button
                type="button"
                className="button"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button--primary"
                disabled={submitting}
              >
                {submitting ? 'Sending…' : 'Submit report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
