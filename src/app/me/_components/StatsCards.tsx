import type { ProfileStats } from '@/lib/profile/types';

interface Props {
  stats: ProfileStats;
}

/**
 * Four-card summary above the incident list. `openReports` is given a
 * tonal variant when non-zero so the user gets a gentle visual nudge
 * that someone flagged their content — without it feeling accusatory.
 */
export function StatsCards({ stats }: Props) {
  return (
    <section className="profile-stats" aria-label="Your activity">
      <Card label="Total incidents" value={stats.total} />
      <Card label="Validated" value={stats.validated} tone="ok" />
      <Card label="Net score" value={stats.scoreSum} />
      <Card
        label="Open reports"
        value={stats.openReports}
        tone={stats.openReports > 0 ? 'warn' : undefined}
      />
    </section>
  );
}

function Card({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'warn';
}) {
  const toneClass = tone ? ` profile-stats__card--${tone}` : '';
  return (
    <div className={`profile-stats__card${toneClass}`}>
      <span className="profile-stats__value">{value.toLocaleString()}</span>
      <span className="profile-stats__label">{label}</span>
    </div>
  );
}
