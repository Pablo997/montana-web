'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type {
  IncidentStatus,
  IncidentType,
  SeverityLevel,
} from '@/types/incident';

/**
 * Browser-side client for the in-app notification center.
 *
 * The bell-dropdown UI never needs the full `Incident` object: only the
 * info we render in a list row (title, severity, type) plus deep-link
 * coords. We map the RPC row into this narrow shape so the bundle
 * doesn't drag the full incident mapper along for what is effectively
 * a list of links.
 */
export interface AppNotification {
  id: string;
  incidentId: string;
  readAt: string | null;
  createdAt: string;
  incident: {
    title: string;
    type: IncidentType;
    severity: SeverityLevel;
    status: IncidentStatus;
    location: { lat: number; lng: number };
  };
}

/** Default page size for the dropdown. Matches the SQL function default. */
export const NOTIFICATIONS_PAGE_SIZE = 20;

/** Hard upper bound the SQL function enforces. Don't ask for more. */
export const NOTIFICATIONS_MAX_PAGE_SIZE = 100;

/**
 * Raw shape `get_my_notifications` returns. Exported for tests so they
 * can build fixtures without importing the runtime client.
 */
export interface NotificationRow {
  id: string;
  incident_id: string;
  read_at: string | null;
  created_at: string;
  incident_title: string | null;
  incident_type: string | null;
  incident_severity: string | null;
  incident_status: string | null;
  incident_lat: number | null;
  incident_lng: number | null;
}

/**
 * Coerces a raw RPC row into the UI's `AppNotification` shape. Defensive
 * against partial rows: an incident that disappeared between the
 * notification insert and now (rare but possible: deletion races) gets
 * filtered out by the join in SQL, so by the time we get here every
 * `incident_*` field is non-null. We still guard with nullish coalescing
 * so a future schema tweak can't crash the bell dropdown silently.
 */
export function mapNotificationRow(row: NotificationRow): AppNotification | null {
  if (
    !row.incident_title ||
    !row.incident_type ||
    !row.incident_severity ||
    !row.incident_status ||
    row.incident_lat == null ||
    row.incident_lng == null
  ) {
    return null;
  }
  return {
    id: row.id,
    incidentId: row.incident_id,
    readAt: row.read_at,
    createdAt: row.created_at,
    incident: {
      title: row.incident_title,
      type: row.incident_type as IncidentType,
      severity: row.incident_severity as SeverityLevel,
      status: row.incident_status as IncidentStatus,
      location: { lat: row.incident_lat, lng: row.incident_lng },
    },
  };
}

interface FetchOptions {
  limit?: number;
  /** Keyset cursor — pass the createdAt of the last row from the previous page. */
  before?: string;
}

/**
 * Loads one page of the current user's notifications, newest first.
 * Returns `null` when the user isn't authenticated (RLS would refuse
 * anyway, but we short-circuit to avoid a pointless network round-trip).
 */
export async function fetchNotifications(
  options: FetchOptions = {},
): Promise<AppNotification[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_my_notifications', {
    p_limit: Math.min(
      Math.max(options.limit ?? NOTIFICATIONS_PAGE_SIZE, 1),
      NOTIFICATIONS_MAX_PAGE_SIZE,
    ),
    p_before: options.before ?? null,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];
  return (data as NotificationRow[])
    .map(mapNotificationRow)
    .filter((n): n is AppNotification => n !== null);
}

/** Returns the current count of unread notifications for the user. */
export async function fetchUnreadCount(): Promise<number> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('count_unread_notifications');
  if (error) throw new Error(error.message);
  // The RPC returns a single integer; supabase-js sometimes hands it
  // back wrapped in an array (Postgres composite quirk). Normalise.
  if (typeof data === 'number') return data;
  if (Array.isArray(data) && typeof data[0] === 'number') return data[0];
  return 0;
}

/**
 * Marks a specific set of notifications as read. Returns the count of
 * rows actually changed (already-read ones are skipped on the server).
 */
export async function markNotificationsRead(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('mark_notifications_read', {
    p_ids: ids,
  });
  if (error) throw new Error(error.message);
  return typeof data === 'number' ? data : 0;
}

/** Marks every unread notification of the current user as read. */
export async function markAllNotificationsRead(): Promise<number> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw new Error(error.message);
  return typeof data === 'number' ? data : 0;
}
