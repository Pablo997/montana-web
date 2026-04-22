import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  mapIncidentRow,
  type AdminIncidentRawRow,
  type AdminIncidentRow,
} from '@/lib/admin/types';
import type { IncidentStatus } from '@/types/incident';
import { IncidentRow } from './_components/IncidentRow';
import { IncidentsSearchForm } from './_components/IncidentsSearchForm';

interface SearchParams {
  status?: string;
  q?: string;
  page?: string;
}

const PAGE_SIZE = 25;

const STATUS_TABS: Array<{ id: IncidentStatus | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'validated', label: 'Validated' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'expired', label: 'Expired' },
];

function parseStatus(raw: string | undefined): IncidentStatus | null {
  const valid: IncidentStatus[] = [
    'pending',
    'validated',
    'dismissed',
    'resolved',
    'expired',
  ];
  if (!raw || raw === 'all') return null;
  return valid.includes(raw as IncidentStatus) ? (raw as IncidentStatus) : null;
}

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

async function fetchIncidents(
  status: IncidentStatus | null,
  search: string | null,
  page: number,
): Promise<{ rows: AdminIncidentRow[]; total: number }> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_incidents', {
    p_status: status,
    p_search: search,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error || !data) return { rows: [], total: 0 };
  const rows = (data as AdminIncidentRawRow[]).map(mapIncidentRow);
  return { rows, total: rows[0]?.totalCount ?? 0 };
}

function buildHref(
  status: IncidentStatus | 'all',
  search: string | null,
  page = 1,
): string {
  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (search) params.set('q', search);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/admin/incidents?${qs}` : '/admin/incidents';
}

export default async function AdminIncidentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const statusFilter = parseStatus(searchParams.status);
  const search = searchParams.q?.trim() || null;
  const page = parsePage(searchParams.page);
  const { rows, total } = await fetchIncidents(statusFilter, search, page);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1 className="admin-page__title">Incidents</h1>
        <p className="admin-page__subtitle">
          All incidents in the system, including hidden ones. Use this to
          proactively remove or restore content before — or after — users flag it.
        </p>
      </header>

      <IncidentsSearchForm
        initialQuery={search ?? ''}
        status={statusFilter ?? 'all'}
      />

      <div className="admin-tabs" role="tablist" aria-label="Incident status">
        {STATUS_TABS.map((tab) => {
          const active =
            (tab.id === 'all' && statusFilter === null) ||
            tab.id === statusFilter;
          return (
            <Link
              key={tab.id}
              href={buildHref(tab.id, search)}
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
        <p className="admin-empty">No incidents match this query.</p>
      ) : (
        <ul className="admin-incident-list">
          {rows.map((row) => (
            <li key={row.id}>
              <IncidentRow row={row} />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav className="admin-pager" aria-label="Pagination">
          {page > 1 ? (
            <Link
              href={buildHref(statusFilter ?? 'all', search, page - 1)}
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
            Page {page} / {totalPages} · {total.toLocaleString()} total
          </span>
          {page < totalPages ? (
            <Link
              href={buildHref(statusFilter ?? 'all', search, page + 1)}
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
