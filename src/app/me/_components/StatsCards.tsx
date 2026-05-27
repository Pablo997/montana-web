import { getLocale, getTranslations } from 'next-intl/server';
import type { ProfileStats } from '@/lib/profile/types';

interface Props {
  stats: ProfileStats;
}

/**
 * Four-card summary above the incident list. `openReports` is given a
 * tonal variant when non-zero so the user gets a gentle visual nudge
 * that someone flagged their content — without it feeling accusatory.
 */
export async function StatsCards({ stats }: Props) {
  const t = await getTranslations('profile');
  const locale = await getLocale();
  return (
    <section className="profile-stats" aria-label={t('statsRegionAria')}>
      <Card label={t('statsCards.totalLabel')} value={stats.total} locale={locale} />
      <Card
        label={t('statsCards.validatedLabel')}
        value={stats.validated}
        tone="ok"
        locale={locale}
      />
      <Card label={t('statsCards.scoreLabel')} value={stats.scoreSum} locale={locale} />
      <Card
        label={t('statsCards.openReportsLabel')}
        value={stats.openReports}
        tone={stats.openReports > 0 ? 'warn' : undefined}
        locale={locale}
      />
    </section>
  );
}

function Card({
  label,
  value,
  tone,
  locale,
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'warn';
  locale: string;
}) {
  const toneClass = tone ? ` profile-stats__card--${tone}` : '';
  return (
    <div className={`profile-stats__card${toneClass}`}>
      <span className="profile-stats__value">{value.toLocaleString(locale)}</span>
      <span className="profile-stats__label">{label}</span>
    </div>
  );
}
