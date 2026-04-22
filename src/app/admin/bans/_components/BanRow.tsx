'use client';

import { useState, useTransition } from 'react';
import type { AdminBanRow } from '@/lib/admin/types';
import { unbanUser } from '@/app/admin/actions';

interface Props {
  row: AdminBanRow;
}

function formatDuration(expiresAt: string | null): string {
  if (!expiresAt) return 'Permanent';
  const diffMs = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 'Expired';
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 24) return `~${hours}h left`;
  const days = Math.round(hours / 24);
  return `~${days}d left`;
}

export function BanRow({ row }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleUnban = () => {
    if (!window.confirm(`Unban ${row.username ?? row.userId.slice(0, 8)}?`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await unbanUser(row.userId);
      if (!result.ok) setError(result.error ?? 'Failed to unban user.');
    });
  };

  return (
    <article className="admin-ban">
      <header className="admin-ban__head">
        <span className="admin-ban__user">
          {row.username ?? row.userId.slice(0, 8)}
        </span>
        <span className="admin-ban__when">
          banned {new Date(row.bannedAt).toLocaleDateString()} ·{' '}
          {formatDuration(row.expiresAt)}
        </span>
      </header>
      <p className="admin-ban__reason">{row.reason}</p>
      {row.bannedByUsername ? (
        <p className="admin-ban__actor">by {row.bannedByUsername}</p>
      ) : null}
      {error ? <p className="admin-ban__error">{error}</p> : null}
      <div className="admin-ban__actions">
        <button
          type="button"
          className="button button--ghost"
          onClick={handleUnban}
          disabled={pending}
        >
          {pending ? 'Unbanning…' : 'Unban'}
        </button>
      </div>
    </article>
  );
}
