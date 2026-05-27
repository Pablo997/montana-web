import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
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

const STATUS_TABS: readonly (IncidentStatus | 'all')[] = [
  'all',
  'pending',
  'validated',
  'dismissed',
  'resolved',
  'expired',
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
  const t = await getTranslations('admin.incidents');
  const locale = await getLocale();

  const statusFilter = parseStatus(searchParams.status);
  const search = searchParams.q?.trim() || null;
  const page = parsePage(searchParams.page);
  const { rows, total } = await fetchIncidents(statusFilter, search, page);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hintKey = statusFilter ?? 'all';

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1 className="admin-page__title">{t('title')}</h1>
        <p className="admin-page__subtitle">{t('subtitle')}</p>
      </header>

      <IncidentsSearchForm
        initialQuery={search ?? ''}
        status={statusFilter ?? 'all'}
      />

      <div className="admin-tabs" role="tablist" aria-label={t('tabAria')}>
        {STATUS_TABS.map((id) => {
          const active =
            (id === 'all' && statusFilter === null) || id === statusFilter;
          return (
            <Link
              key={id}
              href={buildHref(id, search)}
              role="tab"
              aria-selected={active}
              className={`admin-tabs__tab${active ? ' admin-tabs__tab--active' : ''}`}
            >
              {t(`tabs.${id}`)}
            </Link>
          );
        })}
      </div>

      <p className="admin-hint">{t(`hints.${hintKey}`)}</p>

      {rows.length === 0 ? (
        <p className="admin-empty">{t('empty')}</p>
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
        <nav className="admin-pager" aria-label={t('pagerAria')}>
          {page > 1 ? (
            <Link
              href={buildHref(statusFilter ?? 'all', search, page - 1)}
              className="admin-pager__link"
            >
              {t('pagerPrev')}
            </Link>
          ) : (
            <span className="admin-pager__link admin-pager__link--disabled">
              {t('pagerPrev')}
            </span>
          )}
          <span className="admin-pager__info">
            {t('pagerPageWithTotal', {
              page,
              total: totalPages,
              count: total.toLocaleString(locale),
            })}
          </span>
          {page < totalPages ? (
            <Link
              href={buildHref(statusFilter ?? 'all', search, page + 1)}
              className="admin-pager__link"
            >
              {t('pagerNext')}
            </Link>
          ) : (
            <span className="admin-pager__link admin-pager__link--disabled">
              {t('pagerNext')}
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
