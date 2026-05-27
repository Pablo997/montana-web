import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import type { IncidentStatus } from '@/types/incident';
import type { MyIncidentRow } from '@/lib/profile/types';

interface Props {
  row: MyIncidentRow;
}

/**
 * Single row in the user's incident list. Links to the existing detail
 * page where the author already has Resolve / Delete actions, so we
 * don't duplicate those buttons here.
 *
 * Server component: we resolve the locale-dependent enum labels and
 * the date formatter once during render, no client JS needed.
 */
export async function IncidentListItem({ row }: Props) {
  const t = await getTranslations('profile.incidents');
  const incidentT = await getTranslations('incident');
  const locale = await getLocale();

  const formattedDate = (() => {
    const d = new Date(row.createdAt);
    if (Number.isNaN(d.getTime())) return row.createdAt;
    return d.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  })();

  const warn = row.openReportsCount > 0;
  const statusKey: IncidentStatus = row.status;

  return (
    <Link
      href={`/incidents/${row.id}`}
      prefetch={false}
      className={`admin-incident admin-incident--${row.status}${
        warn ? ' admin-incident--flagged' : ''
      } profile-incident`}
    >
      <header className="admin-incident__head">
        <span className="admin-incident__title">{row.title}</span>
        <span
          className={`admin-incident__status admin-incident__status--${row.status}`}
        >
          {t(`statusBadges.${statusKey}`)}
        </span>
        {warn ? (
          <span
            className="admin-incident__flag-badge"
            title={t('reportsBadgeAria')}
          >
            {t('reportsBadge', { count: row.openReportsCount })}
          </span>
        ) : null}
      </header>

      <div className="admin-incident__meta">
        <span>{incidentT(`type.${row.type}`)}</span>
        <span aria-hidden="true">·</span>
        <span>{incidentT(`severity.${row.severity}`)}</span>
        <span aria-hidden="true">·</span>
        <span>{t('scoreLabel', { score: row.score })}</span>
        {row.mediaCount > 0 ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{t('photosBadge', { count: row.mediaCount })}</span>
          </>
        ) : null}
        <span aria-hidden="true">·</span>
        <time dateTime={row.createdAt}>{formattedDate}</time>
      </div>
    </Link>
  );
}
