'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AdminBanRow } from '@/lib/admin/types';
import { unbanUser } from '@/app/admin/actions';

interface Props {
  row: AdminBanRow;
}

export function BanRow({ row }: Props) {
  const t = useTranslations('admin.bans');
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /**
   * "How much of the ban is left?". Kept inline because no other view
   * needs this exact "~Xh / ~Xd" shape, and the strings are colocated
   * with the rest of the bans namespace.
   */
  const formatDuration = (expiresAt: string | null): string => {
    if (!expiresAt) return t('permanent');
    const diffMs = Date.parse(expiresAt) - Date.now();
    if (!Number.isFinite(diffMs) || diffMs <= 0) return t('expired');
    const hours = Math.round(diffMs / 3_600_000);
    if (hours < 24) return t('hoursLeft', { count: hours });
    const days = Math.round(hours / 24);
    return t('daysLeft', { count: days });
  };

  const displayUser = row.username ?? row.userId.slice(0, 8);

  const handleUnban = () => {
    if (!window.confirm(t('unbanConfirm', { user: displayUser }))) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await unbanUser(row.userId);
      if (!result.ok) setError(result.error ?? t('unbanError'));
    });
  };

  return (
    <article className="admin-ban">
      <header className="admin-ban__head">
        <span className="admin-ban__user">{displayUser}</span>
        <span className="admin-ban__when">
          {t('banned', { date: new Date(row.bannedAt).toLocaleDateString(locale) })}{' '}
          · {formatDuration(row.expiresAt)}
        </span>
      </header>
      <p className="admin-ban__reason">{row.reason}</p>
      {row.bannedByUsername ? (
        <p className="admin-ban__actor">
          {t('by', { user: row.bannedByUsername })}
        </p>
      ) : null}
      {error ? <p className="admin-ban__error">{error}</p> : null}
      <div className="admin-ban__actions">
        <button
          type="button"
          className="button button--ghost"
          onClick={handleUnban}
          disabled={pending}
        >
          {pending ? t('unbanning') : t('unban')}
        </button>
      </div>
    </article>
  );
}
