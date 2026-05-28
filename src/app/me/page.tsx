import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
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
import { LinkedAccounts } from './_components/LinkedAccounts';
import { DangerZone } from './_components/DangerZone';
import type { UserIdentity } from '@supabase/supabase-js';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

interface SearchParams {
  status?: string;
  page?: string;
}

const PAGE_SIZE = 20;

const STATUS_TABS: readonly (IncidentStatus | 'all')[] = [
  'all',
  'pending',
  'validated',
  'resolved',
  'dismissed',
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

async function loadData(
  status: IncidentStatus | null,
  page: number,
): Promise<{
  email: string;
  username: string | null;
  createdAt: string | null;
  identities: UserIdentity[];
  stats: ProfileStats;
  rows: MyIncidentRow[];
  total: number;
}> {
  const supabase = createSupabaseServerClient();

  // `getUser()` instead of `getSession()` because this is server-side
  // and the cookie we'd read the id from is not authoritative on its
  // own — only GoTrue's `/auth/v1/user` round-trip validates the JWT
  // signature. The extra latency is hidden by the parallel fan-out
  // below.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/me');

  // Three round-trips in parallel: profile row, stats, page of incidents.
  // Each is fast; firing them concurrently hides their latency behind the
  // slowest one instead of stacking it linearly.
  const [profileRes, statsRes, incidentsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('username, created_at')
      .eq('id', user.id)
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
    email: user.email ?? '',
    username: profileRes.data?.username ?? null,
    createdAt: profileRes.data?.created_at ?? null,
    // `user.identities` is populated by GoTrue on every getUser()
    // call — no extra round-trip. Defaulting to `[]` keeps the
    // component happy on the rare path where it's null (older
    // accounts, edge cases during migrations).
    identities: user.identities ?? [],
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
  const t = await getTranslations('profile');
  const tIncidents = await getTranslations('profile.incidents');
  const locale = await getLocale();

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
          {t('backToMap')}
        </Link>

        <ProfileHeader
          email={data.email}
          username={data.username}
          createdAt={data.createdAt}
        />

        <StatsCards stats={data.stats} />

        <LinkedAccounts identities={data.identities} />

        <section className="profile-section" aria-labelledby="my-incidents">
          <div className="profile-section__head">
            <h2 id="my-incidents" className="profile-section__title">
              {tIncidents('title')}
            </h2>
            <span className="profile-section__count">
              {tIncidents('countTotal', { count: data.total.toLocaleString(locale) })}
            </span>
          </div>

          <div
            className="admin-tabs"
            role="tablist"
            aria-label={tIncidents('sectionAria')}
          >
            {STATUS_TABS.map((id) => {
              const active =
                (id === 'all' && statusFilter === null) || id === statusFilter;
              return (
                <Link
                  key={id}
                  href={buildHref(id)}
                  role="tab"
                  aria-selected={active}
                  className={`admin-tabs__tab${active ? ' admin-tabs__tab--active' : ''}`}
                >
                  {tIncidents(`statusTabs.${id}`)}
                </Link>
              );
            })}
          </div>

          {data.rows.length === 0 ? (
            <p className="admin-empty">
              {statusFilter === null
                ? tIncidents('emptyAll')
                : tIncidents('emptyFiltered')}
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
            <nav className="admin-pager" aria-label={tIncidents('pagerAria')}>
              {page > 1 ? (
                <Link
                  href={buildHref(statusFilter ?? 'all', page - 1)}
                  className="admin-pager__link"
                >
                  {tIncidents('pagerPrev')}
                </Link>
              ) : (
                <span className="admin-pager__link admin-pager__link--disabled">
                  {tIncidents('pagerPrev')}
                </span>
              )}
              <span className="admin-pager__info">
                {tIncidents('pagerPage', { page, total: totalPages })}
              </span>
              {page < totalPages ? (
                <Link
                  href={buildHref(statusFilter ?? 'all', page + 1)}
                  className="admin-pager__link"
                >
                  {tIncidents('pagerNext')}
                </Link>
              ) : (
                <span className="admin-pager__link admin-pager__link--disabled">
                  {tIncidents('pagerNext')}
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
