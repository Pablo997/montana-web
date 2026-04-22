import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  mapActionRow,
  type AdminActionRawRow,
  type AdminActionRow,
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
};

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
          Every moderation action, newest first. Append-only.
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
