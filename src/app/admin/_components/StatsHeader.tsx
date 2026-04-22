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

export async function StatsHeader() {
  const stats = await fetchStats();

  return (
    <section className="admin-stats" aria-label="Moderation overview">
      <StatCard label="Open reports" value={stats.openReports} tone="warn" />
      <StatCard label="Banned users" value={stats.bannedUsers} tone="danger" />
      <StatCard label="Incidents today" value={stats.incidentsToday} />
      <StatCard label="Actions · 24h" value={stats.actions24h} />
    </section>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'warn' | 'danger';
}) {
  const toneClass = tone ? ` admin-stats__card--${tone}` : '';
  return (
    <div className={`admin-stats__card${toneClass}`}>
      <span className="admin-stats__value">{value.toLocaleString()}</span>
      <span className="admin-stats__label">{label}</span>
    </div>
  );
}
