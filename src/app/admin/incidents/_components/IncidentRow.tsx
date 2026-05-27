'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useIncidentLabels } from '@/lib/incidents/useIncidentLabels';
import type { AdminIncidentRow } from '@/lib/admin/types';
import { removeIncident, restoreIncident } from '@/app/admin/actions';
import { BanUserDialog } from '@/app/admin/_components/BanUserDialog';

interface Props {
  row: AdminIncidentRow;
}

export function IncidentRow({ row }: Props) {
  const t = useTranslations('admin.incidentRow');
  const labels = useIncidentLabels();
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<
    { userId: string; username: string | null } | null
  >(null);

  const canRemove = row.status !== 'dismissed' && row.status !== 'resolved';
  const canRestore = row.status === 'dismissed';

  const handleRemove = () => {
    const reason = window.prompt(t('removePromptTitle'), '');
    if (!reason) return;
    setError(null);
    startTransition(async () => {
      const result = await removeIncident(row.id, reason);
      if (!result.ok) setError(result.error ?? t('errorRemove'));
    });
  };

  const handleRestore = () => {
    const reason = window.prompt(t('restorePromptTitle'), '');
    setError(null);
    startTransition(async () => {
      const result = await restoreIncident(row.id, reason || null);
      if (!result.ok) setError(result.error ?? t('errorRestore'));
    });
  };

  const displayUser = row.authorUsername ?? row.authorId.slice(0, 8);
  const formattedDate = new Date(row.createdAt).toLocaleString(locale);

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
          {t(`status.${row.status}`)}
        </span>
        {row.openReportsCount > 0 ? (
          <span
            className="admin-incident__flag-badge"
            title={t('reportsBadgeTitle')}
          >
            {t('reportsBadge', { count: row.openReportsCount })}
          </span>
        ) : null}
      </header>

      <div className="admin-incident__meta">
        <span>{labels.type(row.type)}</span>
        <span aria-hidden="true">·</span>
        <span>{labels.severity(row.severity)}</span>
        <span aria-hidden="true">·</span>
        <span>{t('score', { score: row.score })}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={row.createdAt} title={row.createdAt}>
          {formattedDate}
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
          aria-label={t('banAuthorAria')}
        >
          {t('byUser', { user: displayUser })}
        </button>

        <div className="admin-incident__actions">
          {canRestore ? (
            <button
              type="button"
              className="button button--ghost"
              onClick={handleRestore}
              disabled={pending}
            >
              {pending ? t('working') : t('restore')}
            </button>
          ) : null}
          {canRemove ? (
            <button
              type="button"
              className="button button--danger"
              onClick={handleRemove}
              disabled={pending}
            >
              {t('remove')}
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
