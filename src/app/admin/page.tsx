import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { StatsHeader } from './_components/StatsHeader';
import { ReportRow } from './_components/ReportRow';
import {
  mapReportRow,
  type AdminReportRawRow,
  type AdminReportRow,
  type ReportStatus,
} from '@/lib/admin/types';

interface SearchParams {
  status?: string;
  page?: string;
}

const PAGE_SIZE = 20;
const STATUS_TABS: Array<{ id: ReportStatus | 'all'; label: string }> = [
  { id: 'open', label: 'Pending' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'actioned', label: 'Actioned' },
  { id: 'all', label: 'All' },
];

function parseStatus(raw: string | undefined): ReportStatus | null {
  const set: Array<ReportStatus | 'all'> = ['open', 'dismissed', 'actioned', 'all'];
  if (!raw || !set.includes(raw as ReportStatus | 'all')) return 'open';
  if (raw === 'all') return null;
  return raw as ReportStatus;
}

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

async function fetchReports(
  status: ReportStatus | null,
  page: number,
): Promise<{ rows: AdminReportRow[]; total: number }> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_reports', {
    p_status: status,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error || !data) return { rows: [], total: 0 };
  const rows = (data as AdminReportRawRow[]).map(mapReportRow);
  return { rows, total: rows[0]?.totalCount ?? 0 };
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const statusFilter = parseStatus(searchParams.status);
  const page = parsePage(searchParams.page);
  const { rows, total } = await fetchReports(statusFilter, page);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-page">
      <StatsHeader />

      <div className="admin-tabs" role="tablist" aria-label="Report status">
        {STATUS_TABS.map((tab) => {
          const active =
            (tab.id === 'all' && statusFilter === null) ||
            tab.id === statusFilter;
          const href =
            tab.id === 'all'
              ? '/admin?status=all'
              : `/admin?status=${tab.id}`;
          return (
            <Link
              key={tab.id}
              href={href}
              role="tab"
              aria-selected={active}
              className={`admin-tabs__tab${active ? ' admin-tabs__tab--active' : ''}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="admin-empty">
          {statusFilter === 'open'
            ? 'Inbox zero. No pending reports right now.'
            : 'No reports match this filter.'}
        </p>
      ) : (
        <ul className="admin-report-list">
          {rows.map((row) => (
            <li key={row.reportId}>
              <ReportRow row={row} />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <Pager
          page={page}
          totalPages={totalPages}
          statusParam={statusFilter === null ? 'all' : statusFilter}
        />
      ) : null}
    </div>
  );
}

function Pager({
  page,
  totalPages,
  statusParam,
}: {
  page: number;
  totalPages: number;
  statusParam: string;
}) {
  const prev = page > 1 ? `/admin?status=${statusParam}&page=${page - 1}` : null;
  const next =
    page < totalPages ? `/admin?status=${statusParam}&page=${page + 1}` : null;

  return (
    <nav className="admin-pager" aria-label="Pagination">
      {prev ? (
        <Link href={prev} className="admin-pager__link">
          ← Prev
        </Link>
      ) : (
        <span className="admin-pager__link admin-pager__link--disabled">← Prev</span>
      )}
      <span className="admin-pager__info">
        Page {page} / {totalPages}
      </span>
      {next ? (
        <Link href={next} className="admin-pager__link">
          Next →
        </Link>
      ) : (
        <span className="admin-pager__link admin-pager__link--disabled">Next →</span>
      )}
    </nav>
  );
}
