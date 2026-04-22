'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
} from '@/types/incident';
import type { AdminReportRow } from '@/lib/admin/types';
import {
  dismissReport,
  removeIncident,
} from '@/app/admin/actions';
import { BanUserDialog } from './BanUserDialog';

interface Props {
  row: AdminReportRow;
}

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  false_info: 'False info',
  inappropriate: 'Inappropriate',
  personal_data: 'Personal data',
  other: 'Other',
};

function formatRelative(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function ReportRow({ row }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<
    { userId: string; username: string | null } | null
  >(null);

  const handleDismiss = () => {
    setError(null);
    startTransition(async () => {
      const result = await dismissReport(row.reportId);
      if (!result.ok) setError(result.error ?? 'Failed to dismiss report.');
    });
  };

  const handleRemove = () => {
    const reason = window.prompt(
      'Reason for removing this incident (shown only in the audit log):',
      REASON_LABELS[row.reason] ?? row.reason,
    );
    if (!reason) return;
    setError(null);
    startTransition(async () => {
      const result = await removeIncident(row.incidentId, reason);
      if (!result.ok) setError(result.error ?? 'Failed to remove incident.');
    });
  };

  const actionable = row.status === 'open';

  return (
    <article
      className={`admin-report${!actionable ? ' admin-report--resolved' : ''}`}
    >
      <header className="admin-report__head">
        <span className={`admin-report__badge admin-report__badge--${row.reason}`}>
          {REASON_LABELS[row.reason] ?? row.reason}
        </span>
        <span className="admin-report__time" title={row.createdAt}>
          {formatRelative(row.createdAt)}
        </span>
        <span className={`admin-report__status admin-report__status--${row.status}`}>
          {row.status}
        </span>
      </header>

      <Link
        href={`/incidents/${row.incidentId}`}
        className="admin-report__incident"
        prefetch={false}
      >
        <span className="admin-report__title">{row.incidentTitle}</span>
        <span className="admin-report__meta">
          {INCIDENT_TYPE_LABELS[row.incidentType]} ·{' '}
          {SEVERITY_LABELS[row.incidentSeverity]} · {row.incidentStatus}
        </span>
      </Link>

      {row.details ? (
        <p className="admin-report__details">{row.details}</p>
      ) : null}

      <footer className="admin-report__foot">
        <div className="admin-report__people">
          <span className="admin-report__person">
            <span className="admin-report__person-label">Reported by</span>
            <button
              type="button"
              className="admin-report__person-link"
              onClick={() =>
                setBanTarget({
                  userId: row.reporterId,
                  username: row.reporterUsername,
                })
              }
              aria-label="Ban reporter"
            >
              {row.reporterUsername ?? row.reporterId.slice(0, 8)}
            </button>
          </span>
          <span className="admin-report__person">
            <span className="admin-report__person-label">Author</span>
            <button
              type="button"
              className="admin-report__person-link"
              onClick={() =>
                setBanTarget({
                  userId: row.incidentAuthorId,
                  username: row.incidentAuthorUsername,
                })
              }
              aria-label="Ban author"
            >
              {row.incidentAuthorUsername ?? row.incidentAuthorId.slice(0, 8)}
            </button>
          </span>
        </div>

        {actionable ? (
          <div className="admin-report__actions">
            <button
              type="button"
              className="button button--ghost"
              onClick={handleDismiss}
              disabled={pending}
            >
              {pending ? 'Working…' : 'Dismiss'}
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={handleRemove}
              disabled={pending}
            >
              Remove incident
            </button>
          </div>
        ) : null}
      </footer>

      {error ? <p className="admin-report__error">{error}</p> : null}

      {banTarget ? (
        <BanUserDialog
          userId={banTarget.userId}
          username={banTarget.username}
          onClose={() => setBanTarget(null)}
        />
      ) : null}
    </article>
  );
}
