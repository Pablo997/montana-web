'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useIncidentLabels } from '@/lib/incidents/useIncidentLabels';
import type { AdminReportRow } from '@/lib/admin/types';
import {
  dismissReport,
  removeIncident,
} from '@/app/admin/actions';
import { BanUserDialog } from './BanUserDialog';

interface Props {
  row: AdminReportRow;
}

export function ReportRow({ row }: Props) {
  const t = useTranslations('admin.reportRow');
  const labels = useIncidentLabels();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<
    { userId: string; username: string | null } | null
  >(null);

  /**
   * Compact, locale-aware "x minutes ago" formatter. We don't use
   * `Intl.RelativeTimeFormat` here because the design wants the tight
   * `5m / 2h / 3d` shape, which doesn't map well to the formatter's
   * verbose output. Translations live alongside the rest of the row.
   */
  const formatRelative = (iso: string): string => {
    const diffMs = Date.now() - Date.parse(iso);
    const minutes = Math.round(diffMs / 60_000);
    if (minutes < 1) return t('relativeJustNow');
    if (minutes < 60) return t('relativeMinAgo', { count: minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t('relativeHoursAgo', { count: hours });
    const days = Math.round(hours / 24);
    return t('relativeDaysAgo', { count: days });
  };

  const handleDismiss = () => {
    setError(null);
    startTransition(async () => {
      const result = await dismissReport(row.reportId);
      if (!result.ok) setError(result.error ?? t('errorDismiss'));
    });
  };

  const handleRemove = () => {
    const reason = window.prompt(
      t('removePromptTitle'),
      t(`reasons.${row.reason}`),
    );
    if (!reason) return;
    setError(null);
    startTransition(async () => {
      const result = await removeIncident(row.incidentId, reason);
      if (!result.ok) setError(result.error ?? t('errorRemove'));
    });
  };

  const actionable = row.status === 'open';

  return (
    <article
      className={`admin-report${!actionable ? ' admin-report--resolved' : ''}`}
    >
      <header className="admin-report__head">
        <span className={`admin-report__badge admin-report__badge--${row.reason}`}>
          {t(`reasons.${row.reason}`)}
        </span>
        <span className="admin-report__time" title={row.createdAt}>
          {formatRelative(row.createdAt)}
        </span>
        <span className={`admin-report__status admin-report__status--${row.status}`}>
          {t(`status.${row.status}`)}
        </span>
      </header>

      <Link
        href={`/incidents/${row.incidentId}`}
        className="admin-report__incident"
        prefetch={false}
      >
        <span className="admin-report__title">{row.incidentTitle}</span>
        <span className="admin-report__meta">
          {labels.type(row.incidentType)} · {labels.severity(row.incidentSeverity)} ·{' '}
          {labels.status(row.incidentStatus)}
        </span>
      </Link>

      {row.details ? (
        <p className="admin-report__details">{row.details}</p>
      ) : null}

      <footer className="admin-report__foot">
        <div className="admin-report__people">
          <span className="admin-report__person">
            <span className="admin-report__person-label">{t('reportedByLabel')}</span>
            <button
              type="button"
              className="admin-report__person-link"
              onClick={() =>
                setBanTarget({
                  userId: row.reporterId,
                  username: row.reporterUsername,
                })
              }
              aria-label={t('banReporterAria')}
            >
              {row.reporterUsername ?? row.reporterId.slice(0, 8)}
            </button>
          </span>
          <span className="admin-report__person">
            <span className="admin-report__person-label">{t('authorLabel')}</span>
            <button
              type="button"
              className="admin-report__person-link"
              onClick={() =>
                setBanTarget({
                  userId: row.incidentAuthorId,
                  username: row.incidentAuthorUsername,
                })
              }
              aria-label={t('banAuthorAria')}
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
              {pending ? t('working') : t('dismiss')}
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={handleRemove}
              disabled={pending}
            >
              {t('remove')}
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
