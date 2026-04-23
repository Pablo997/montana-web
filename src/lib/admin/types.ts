import type { IncidentStatus, IncidentType, SeverityLevel } from '@/types/incident';

export interface AdminStats {
  openReports: number;
  bannedUsers: number;
  incidentsToday: number;
  actions24h: number;
}

export type ReportStatus = 'open' | 'reviewed' | 'dismissed' | 'actioned';

export interface AdminReportRow {
  reportId: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  reviewedAt: string | null;
  reporterId: string;
  reporterUsername: string | null;
  incidentId: string;
  incidentTitle: string;
  incidentStatus: IncidentStatus;
  incidentType: IncidentType;
  incidentSeverity: SeverityLevel;
  incidentCreatedAt: string;
  incidentAuthorId: string;
  incidentAuthorUsername: string | null;
  totalCount: number;
}

export interface AdminBanRow {
  userId: string;
  username: string | null;
  reason: string;
  bannedAt: string;
  bannedBy: string | null;
  bannedByUsername: string | null;
  expiresAt: string | null;
  totalCount: number;
}

export type ModerationAction =
  | 'dismiss_report'
  | 'remove_incident'
  | 'restore_incident'
  | 'ban_user'
  | 'unban_user'
  | 'author_edit_incident';

/**
 * Shape of `meta` for an `author_edit_incident` audit entry. The SQL
 * trigger (`log_author_edit_incident`) stores a diff with either or
 * both of these keys — whichever field the author actually changed.
 */
export interface AuthorEditMeta {
  title?: { from: string; to: string };
  description?: { from: string | null; to: string | null };
}

export type ModerationTargetKind = 'report' | 'incident' | 'user';

export interface AdminIncidentRow {
  id: string;
  title: string;
  type: IncidentType;
  severity: SeverityLevel;
  status: IncidentStatus;
  authorId: string;
  authorUsername: string | null;
  openReportsCount: number;
  score: number;
  createdAt: string;
  totalCount: number;
}

export interface AdminIncidentRawRow {
  id: string;
  title: string;
  type: IncidentType;
  severity: SeverityLevel;
  status: IncidentStatus;
  author_id: string;
  author_username: string | null;
  open_reports_count: number;
  score: number;
  created_at: string;
  total_count: number;
}

export function mapIncidentRow(row: AdminIncidentRawRow): AdminIncidentRow {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    severity: row.severity,
    status: row.status,
    authorId: row.author_id,
    authorUsername: row.author_username,
    openReportsCount: Number(row.open_reports_count ?? 0),
    score: Number(row.score ?? 0),
    createdAt: row.created_at,
    totalCount: Number(row.total_count),
  };
}

export interface AdminActionRow {
  id: string;
  actorId: string;
  actorUsername: string | null;
  action: ModerationAction;
  targetKind: ModerationTargetKind;
  targetId: string;
  reason: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  totalCount: number;
}

/**
 * Raw shape of a single row returned by `admin_list_reports` — kept
 * private to the admin module so the snake_case API never leaks into
 * the React components.
 */
export interface AdminReportRawRow {
  report_id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  reviewed_at: string | null;
  reporter_id: string;
  reporter_username: string | null;
  incident_id: string;
  incident_title: string;
  incident_status: IncidentStatus;
  incident_type: IncidentType;
  incident_severity: SeverityLevel;
  incident_created_at: string;
  incident_author_id: string;
  incident_author_username: string | null;
  total_count: number;
}

export interface AdminBanRawRow {
  user_id: string;
  username: string | null;
  reason: string;
  banned_at: string;
  banned_by: string | null;
  banned_by_username: string | null;
  expires_at: string | null;
  total_count: number;
}

export interface AdminActionRawRow {
  id: string;
  actor_id: string;
  actor_username: string | null;
  action: ModerationAction;
  target_kind: ModerationTargetKind;
  target_id: string;
  reason: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  total_count: number;
}

export function mapReportRow(row: AdminReportRawRow): AdminReportRow {
  return {
    reportId: row.report_id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reporterId: row.reporter_id,
    reporterUsername: row.reporter_username,
    incidentId: row.incident_id,
    incidentTitle: row.incident_title,
    incidentStatus: row.incident_status,
    incidentType: row.incident_type,
    incidentSeverity: row.incident_severity,
    incidentCreatedAt: row.incident_created_at,
    incidentAuthorId: row.incident_author_id,
    incidentAuthorUsername: row.incident_author_username,
    totalCount: Number(row.total_count),
  };
}

export function mapBanRow(row: AdminBanRawRow): AdminBanRow {
  return {
    userId: row.user_id,
    username: row.username,
    reason: row.reason,
    bannedAt: row.banned_at,
    bannedBy: row.banned_by,
    bannedByUsername: row.banned_by_username,
    expiresAt: row.expires_at,
    totalCount: Number(row.total_count),
  };
}

export function mapActionRow(row: AdminActionRawRow): AdminActionRow {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorUsername: row.actor_username,
    action: row.action,
    targetKind: row.target_kind,
    targetId: row.target_id,
    reason: row.reason,
    meta: row.meta,
    createdAt: row.created_at,
    totalCount: Number(row.total_count),
  };
}
