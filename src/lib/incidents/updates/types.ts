/**
 * Single chronological follow-up on an incident. The server returns
 * rows in snake_case; the mapper below normalises to the camelCase
 * shape the UI consumes so the PostgREST contract never leaks out
 * of this module.
 */
export interface IncidentUpdate {
  id: string;
  incidentId: string;
  userId: string;
  username: string | null;
  body: string;
  createdAt: string;
}

export interface IncidentUpdateRawRow {
  id: string;
  incident_id: string;
  user_id: string;
  username: string | null;
  body: string;
  created_at: string;
}

export function mapIncidentUpdate(row: IncidentUpdateRawRow): IncidentUpdate {
  return {
    id: row.id,
    incidentId: row.incident_id,
    userId: row.user_id,
    username: row.username,
    body: row.body,
    createdAt: row.created_at,
  };
}
