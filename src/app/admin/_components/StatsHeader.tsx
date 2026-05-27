import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AdminStats } from '@/lib/admin/types';

async function fetchStats(): Promise<AdminStats> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_stats');
  if (error || !data) {
    return { openReports: 0, bannedUsers: 0, incidentsToday: 0, actions24h: 0 };
  }
  // PostgREST returns the JSON as-is; narrow defensively in case a field
  // is missing so the dashboard never crashes on a partial response.
  const raw = data as Partial<Record<keyof AdminStats, number>>;
  return {
    openReports: Number(raw.openReports ?? 0),
    bannedUsers: Number(raw.bannedUsers ?? 0),
    incidentsToday: Number(raw.incidentsToday ?? 0),
    actions24h: Number(raw.actions24h ?? 0),
  };
}

/**
 * Dashboard overview at the top of every admin page.
 *
 * Each card is a navigation hint: clicking drops you into the section of
 * the panel that actually lets you act on those numbers. Without this,
 * "Actions · 24h: 2" was dead information — the counter would go up
 * from author-edit triggers (audit log) but none of the sub-tabs on
 * `/admin` (which only lists *reports*) would show them.
 */
export async function StatsHeader() {
  const t = await getTranslations('admin.stats');
  const locale = await getLocale();
  const stats = await fetchStats();

  return (
    <section className="admin-stats" aria-label={t('regionAria')}>
      <StatCard
        label={t('openReports')}
        value={stats.openReports}
        tone="warn"
        href="/admin?status=open"
        locale={locale}
      />
      <StatCard
        label={t('bannedUsers')}
        value={stats.bannedUsers}
        tone="danger"
        href="/admin/bans"
        locale={locale}
      />
      <StatCard
        label={t('incidentsToday')}
        value={stats.incidentsToday}
        href="/admin/incidents"
        locale={locale}
      />
      <StatCard
        label={t('actions24h')}
        value={stats.actions24h}
        href="/admin/activity"
        locale={locale}
      />
    </section>
  );
}

function StatCard({
  label,
  value,
  tone,
  href,
  locale,
}: {
  label: string;
  value: number;
  tone?: 'warn' | 'danger';
  href: string;
  locale: string;
}) {
  const toneClass = tone ? ` admin-stats__card--${tone}` : '';
  return (
    <Link
      href={href}
      prefetch={false}
      className={`admin-stats__card admin-stats__card--link${toneClass}`}
    >
      <span className="admin-stats__value">{value.toLocaleString(locale)}</span>
      <span className="admin-stats__label">{label}</span>
    </Link>
  );
}
