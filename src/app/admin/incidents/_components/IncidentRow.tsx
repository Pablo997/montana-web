'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
} from '@/types/incident';
import type { AdminIncidentRow } from '@/lib/admin/types';
import { removeIncident, restoreIncident } from '@/app/admin/actions';
import { BanUserDialog } from '@/app/admin/_components/BanUserDialog';

interface Props {
  row: AdminIncidentRow;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function IncidentRow({ row }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<
    { userId: string; username: string | null } | null
  >(null);

  const canRemove = row.status !== 'dismissed' && row.status !== 'resolved';
  const canRestore = row.status === 'dismissed';

  const handleRemove = () => {
    const reason = window.prompt(
      'Reason for removing this incident (audit log):',
      '',
    );
    if (!reason) return;
    setError(null);
    startTransition(async () => {
      const result = await removeIncident(row.id, reason);
      if (!result.ok) setError(result.error ?? 'Failed to remove incident.');
    });
  };

  const handleRestore = () => {
    const reason = window.prompt(
      'Reason for restoring this incident (optional):',
      '',
    );
    setError(null);
    startTransition(async () => {
      const result = await restoreIncident(row.id, reason || null);
      if (!result.ok) setError(result.error ?? 'Failed to restore incident.');
    });
  };

  return (
    <article
      className={`admin-incident admin-incident--${row.status}${
        row.openReportsCount > 0 ? ' admin-incident--flagged' : ''
      }`}
    >
      <header className="admin-incident__head">
        <Link
          href={`/incidents/${row.id}`}
          className="admin-incident__title"
          prefetch={false}
        >
          {row.title}
        </Link>
        <span className={`admin-incident__status admin-incident__status--${row.status}`}>
          {row.status}
        </span>
        {row.openReportsCount > 0 ? (
          <span className="admin-incident__flag-badge" title="Open reports">
            {row.openReportsCount} report{row.openReportsCount === 1 ? '' : 's'}
          </span>
        ) : null}
      </header>

      <div className="admin-incident__meta">
        <span>{INCIDENT_TYPE_LABELS[row.type]}</span>
        <span aria-hidden="true">·</span>
        <span>{SEVERITY_LABELS[row.severity]}</span>
        <span aria-hidden="true">·</span>
        <span>score {row.score}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={row.createdAt} title={row.createdAt}>
          {formatDate(row.createdAt)}
        </time>
      </div>

      <div className="admin-incident__foot">
        <button
          type="button"
          className="admin-incident__author"
          onClick={() =>
            setBanTarget({
              userId: row.authorId,
              username: row.authorUsername,
            })
          }
          aria-label="Ban author"
        >
          by {row.authorUsername ?? row.authorId.slice(0, 8)}
        </button>

        <div className="admin-incident__actions">
          {canRestore ? (
            <button
              type="button"
              className="button button--ghost"
              onClick={handleRestore}
              disabled={pending}
            >
              {pending ? 'Working…' : 'Restore'}
            </button>
          ) : null}
          {canRemove ? (
            <button
              type="button"
              className="button button--danger"
              onClick={handleRemove}
              disabled={pending}
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="admin-incident__error">{error}</p> : null}

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
