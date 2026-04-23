import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  mapMyIncidentRow,
  mapStats,
  type MyIncidentRawRow,
  type MyIncidentRow,
  type ProfileStats,
} from '@/lib/profile/types';
import type { IncidentStatus } from '@/types/incident';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { ProfileHeader } from './_components/ProfileHeader';
import { StatsCards } from './_components/StatsCards';
import { IncidentListItem } from './_components/IncidentListItem';
import { DangerZone } from './_components/DangerZone';

export const metadata: Metadata = {
  title: 'My profile · Montana',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface SearchParams {
  status?: string;
  page?: string;
}

const PAGE_SIZE = 20;

const STATUS_TABS: Array<{ id: IncidentStatus | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'validated', label: 'Validated' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
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

async function loadData(
  status: IncidentStatus | null,
  page: number,
): Promise<{
  email: string;
  username: string | null;
  createdAt: string | null;
  stats: ProfileStats;
  rows: MyIncidentRow[];
  total: number;
}> {
  const supabase = createSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect('/login?next=/me');

  // Three round-trips in parallel: profile row, stats, page of incidents.
  // Each is fast; firing them concurrently hides their latency behind the
  // slowest one instead of stacking it linearly.
  const [profileRes, statsRes, incidentsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('username, created_at')
      .eq('id', session.user.id)
      .single(),
    supabase.rpc('my_stats'),
    supabase.rpc('my_incidents', {
      p_status: status,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const rows =
    incidentsRes.data != null
      ? (incidentsRes.data as MyIncidentRawRow[]).map(mapMyIncidentRow)
      : [];

  return {
    email: session.user.email ?? '',
    username: profileRes.data?.username ?? null,
    createdAt: profileRes.data?.created_at ?? null,
    stats: mapStats(statsRes.data),
    rows,
    total: rows[0]?.totalCount ?? 0,
  };
}

function buildHref(status: IncidentStatus | 'all', page = 1): string {
  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/me?${qs}` : '/me';
}

export default async function MyProfilePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const statusFilter = parseStatus(searchParams.status);
  const page = parsePage(searchParams.page);
  const data = await loadData(statusFilter, page);
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="app-shell">
      <SiteHeader />

      <main className="profile-shell">
        <Link href="/" className="page-back" prefetch={false}>
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M10 3 L5 8 L10 13"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to map
        </Link>

        <ProfileHeader
          email={data.email}
          username={data.username}
          createdAt={data.createdAt}
        />

        <StatsCards stats={data.stats} />

        <section className="profile-section" aria-labelledby="my-incidents">
          <div className="profile-section__head">
            <h2 id="my-incidents" className="profile-section__title">
              My incidents
            </h2>
            <span className="profile-section__count">
              {data.total.toLocaleString()} total
            </span>
          </div>

          <div className="admin-tabs" role="tablist" aria-label="Incident status">
            {STATUS_TABS.map((tab) => {
              const active =
                (tab.id === 'all' && statusFilter === null) ||
                tab.id === statusFilter;
              return (
                <Link
                  key={tab.id}
                  href={buildHref(tab.id)}
                  role="tab"
                  aria-selected={active}
                  className={`admin-tabs__tab${active ? ' admin-tabs__tab--active' : ''}`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          {data.rows.length === 0 ? (
            <p className="admin-empty">
              {statusFilter === null
                ? "You haven't reported any incident yet. Tap the map to create one."
                : 'No incidents match this filter.'}
            </p>
          ) : (
            <ul className="admin-incident-list">
              {data.rows.map((row) => (
                <li key={row.id}>
                  <IncidentListItem row={row} />
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 ? (
            <nav className="admin-pager" aria-label="Pagination">
              {page > 1 ? (
                <Link
                  href={buildHref(statusFilter ?? 'all', page - 1)}
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
                  href={buildHref(statusFilter ?? 'all', page + 1)}
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
        </section>

        <DangerZone />
      </main>
    </div>
  );
}
