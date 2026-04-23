import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  mapActionRow,
  type AdminActionRawRow,
  type AdminActionRow,
  type AuthorEditMeta,
  type ModerationAction,
  type ModerationTargetKind,
} from '@/lib/admin/types';

interface SearchParams {
  page?: string;
}

const PAGE_SIZE = 50;

const ACTION_VERBS: Record<ModerationAction, string> = {
  dismiss_report: 'dismissed a report on',
  remove_incident: 'removed incident',
  restore_incident: 'restored incident',
  ban_user: 'banned user',
  unban_user: 'unbanned user',
  author_edit_incident: 'edited their incident',
};

/** Trim long diff values so a 2000-char description doesn't flood the log. */
function trim(value: string | null | undefined, max = 80): string {
  if (!value) return '∅';
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Renders the diff stored on an `author_edit_incident` audit row.
 * Falls back to nothing when `meta` is missing or malformed — we never
 * want the audit feed to crash on a single bad row.
 */
function renderAuthorEditMeta(meta: unknown): React.ReactNode {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as AuthorEditMeta;
  const rows: React.ReactNode[] = [];
  if (m.title && typeof m.title === 'object') {
    rows.push(
      <div key="title" className="admin-activity__diff-row">
        <span className="admin-activity__diff-label">title:</span>{' '}
        <span className="admin-activity__diff-from">{trim(m.title.from)}</span>
        {' → '}
        <span className="admin-activity__diff-to">{trim(m.title.to)}</span>
      </div>,
    );
  }
  if (m.description && typeof m.description === 'object') {
    rows.push(
      <div key="desc" className="admin-activity__diff-row">
        <span className="admin-activity__diff-label">description:</span>{' '}
        <span className="admin-activity__diff-from">
          {trim(m.description.from)}
        </span>
        {' → '}
        <span className="admin-activity__diff-to">
          {trim(m.description.to)}
        </span>
      </div>,
    );
  }
  if (rows.length === 0) return null;
  return <div className="admin-activity__diff">{rows}</div>;
}

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

async function fetchActions(page: number): Promise<{
  rows: AdminActionRow[];
  total: number;
}> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_actions', {
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error || !data) return { rows: [], total: 0 };
  const rows = (data as AdminActionRawRow[]).map(mapActionRow);
  return { rows, total: rows[0]?.totalCount ?? 0 };
}

function targetHref(kind: ModerationTargetKind, id: string): string | null {
  if (kind === 'incident') return `/incidents/${id}`;
  return null;
}

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const page = parsePage(searchParams.page);
  const { rows, total } = await fetchActions(page);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1 className="admin-page__title">Activity log</h1>
        <p className="admin-page__subtitle">
          A chronological audit trail of every moderation action taken
          on the platform — who did what, on which target, and why.
          Entries here are append-only: they cannot be edited or
          deleted, which makes this the canonical record if you ever
          need to review past decisions.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="admin-empty">No moderation actions yet.</p>
      ) : (
        <ol className="admin-activity">
          {rows.map((row) => {
            const href = targetHref(row.targetKind, row.targetId);
            return (
              <li key={row.id} className="admin-activity__item">
                <time
                  dateTime={row.createdAt}
                  className="admin-activity__time"
                  title={row.createdAt}
                >
                  {new Date(row.createdAt).toLocaleString()}
                </time>
                <div className="admin-activity__body">
                  <strong>{row.actorUsername ?? 'Unknown'}</strong>{' '}
                  {ACTION_VERBS[row.action] ?? row.action}{' '}
                  {href ? (
                    <Link href={href} prefetch={false}>
                      {row.targetId.slice(0, 8)}
                    </Link>
                  ) : (
                    <code>{row.targetId.slice(0, 8)}</code>
                  )}
                  {row.reason ? (
                    <span className="admin-activity__reason"> — {row.reason}</span>
                  ) : null}
                  {row.action === 'author_edit_incident'
                    ? renderAuthorEditMeta(row.meta)
                    : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {totalPages > 1 ? (
        <nav className="admin-pager" aria-label="Pagination">
          {page > 1 ? (
            <Link
              href={`/admin/activity?page=${page - 1}`}
              className="admin-pager__link"
            >
              ← Prev
            </Link>
          ) : (
            <span className="admin-pager__link admin-pager__link--disabled">
              ← Prev
            </span>
          )}
          <span className="admin-pager__info">
            Page {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/admin/activity?page=${page + 1}`}
              className="admin-pager__link"
            >
              Next →
            </Link>
          ) : (
            <span className="admin-pager__link admin-pager__link--disabled">
              Next →
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
