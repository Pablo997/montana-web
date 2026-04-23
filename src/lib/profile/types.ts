import type {
  IncidentStatus,
  IncidentType,
  SeverityLevel,
} from '@/types/incident';

export interface ProfileStats {
  total: number;
  validated: number;
  pending: number;
  dismissed: number;
  resolved: number;
  scoreSum: number;
  openReports: number;
}

export interface MyIncidentRow {
  id: string;
  title: string;
  type: IncidentType;
  severity: SeverityLevel;
  status: IncidentStatus;
  score: number;
  upvotes: number;
  downvotes: number;
  mediaCount: number;
  openReportsCount: number;
  createdAt: string;
  expiresAt: string | null;
  totalCount: number;
}

export interface MyIncidentRawRow {
  id: string;
  title: string;
  type: IncidentType;
  severity: SeverityLevel;
  status: IncidentStatus;
  score: number;
  upvotes: number;
  downvotes: number;
  media_count: number;
  open_reports_count: number;
  created_at: string;
  expires_at: string | null;
  total_count: number;
}

export function mapMyIncidentRow(row: MyIncidentRawRow): MyIncidentRow {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    severity: row.severity,
    status: row.status,
    score: Number(row.score ?? 0),
    upvotes: Number(row.upvotes ?? 0),
    downvotes: Number(row.downvotes ?? 0),
    mediaCount: Number(row.media_count ?? 0),
    openReportsCount: Number(row.open_reports_count ?? 0),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    totalCount: Number(row.total_count),
  };
}

const EMPTY_STATS: ProfileStats = {
  total: 0,
  validated: 0,
  pending: 0,
  dismissed: 0,
  resolved: 0,
  scoreSum: 0,
  openReports: 0,
};

/**
 * PostgREST returns the JSON verbatim. Narrow each field defensively so
 * a partial response never takes the page down — stats are informational,
 * not load-bearing.
 */
export function mapStats(raw: unknown): ProfileStats {
  if (!raw || typeof raw !== 'object') return EMPTY_STATS;
  const r = raw as Partial<Record<keyof ProfileStats, unknown>>;
  return {
    total: Number(r.total ?? 0),
    validated: Number(r.validated ?? 0),
    pending: Number(r.pending ?? 0),
    dismissed: Number(r.dismissed ?? 0),
    resolved: Number(r.resolved ?? 0),
    scoreSum: Number(r.scoreSum ?? 0),
    openReports: Number(r.openReports ?? 0),
  };
}
