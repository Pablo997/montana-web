import Link from 'next/link';
import {
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
} from '@/types/incident';
import type { MyIncidentRow } from '@/lib/profile/types';

interface Props {
  row: MyIncidentRow;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Single row in the user's incident list. Links to the existing detail
 * page where the author already has Resolve / Delete actions, so we
 * don't duplicate those buttons here.
 */
export function IncidentListItem({ row }: Props) {
  const warn = row.openReportsCount > 0;

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
          {row.status}
        </span>
        {warn ? (
          <span className="admin-incident__flag-badge" title="Open reports">
            {row.openReportsCount} report{row.openReportsCount === 1 ? '' : 's'}
          </span>
        ) : null}
      </header>

      <div className="admin-incident__meta">
        <span>{INCIDENT_TYPE_LABELS[row.type]}</span>
        <span aria-hidden="true">·</span>
        <span>{SEVERITY_LABELS[row.severity]}</span>
        <span aria-hidden="true">·</span>
        <span>score {row.score}</span>
        {row.mediaCount > 0 ? (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {row.mediaCount} photo{row.mediaCount === 1 ? '' : 's'}
            </span>
          </>
        ) : null}
        <span aria-hidden="true">·</span>
        <time dateTime={row.createdAt}>{formatDate(row.createdAt)}</time>
      </div>
    </Link>
  );
}
