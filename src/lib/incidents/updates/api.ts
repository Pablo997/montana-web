import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  CreateIncidentUpdateSchema,
  type CreateIncidentUpdateInput,
} from './schemas';
import {
  mapIncidentUpdate,
  type IncidentUpdate,
  type IncidentUpdateRawRow,
} from './types';

const supabase = () => createSupabaseBrowserClient();

/**
 * Raised by `createIncidentUpdate` when the BEFORE INSERT rate-limit
 * trigger (`enforce_incident_update_rate_limit`) fires. The UI renders
 * a friendly "you've posted N already" message instead of a raw
 * Postgres error dump.
 */
export class UpdateRateLimitError extends Error {
  constructor(public readonly limit: number) {
    super(
      `You've posted ${limit} updates on this incident in the last 24 hours. Try again later.`,
    );
    this.name = 'UpdateRateLimitError';
  }
}

export async function fetchIncidentUpdates(
  incidentId: string,
  limit = 100,
): Promise<IncidentUpdate[]> {
  const { data, error } = await supabase().rpc('list_incident_updates', {
    p_incident_id: incidentId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((row: IncidentUpdateRawRow) => mapIncidentUpdate(row));
}

export async function createIncidentUpdate(
  incidentId: string,
  input: CreateIncidentUpdateInput,
): Promise<IncidentUpdate> {
  const payload = CreateIncidentUpdateSchema.parse(input);

  const { data: session } = await supabase().auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('Not authenticated.');

  const { data, error } = await supabase()
    .from('incident_updates')
    .insert({
      incident_id: incidentId,
      user_id: userId,
      body: payload.body,
    })
    .select('id, incident_id, user_id, body, created_at')
    .single();

  if (error) {
    // P0001 `RATE_LIMIT_UPDATES` carries the configured limit in `hint`.
    const msg = error.message ?? '';
    const hint = (error as { hint?: string }).hint ?? '';
    if (msg.includes('RATE_LIMIT_UPDATES')) {
      throw new UpdateRateLimitError(Number(hint) || 5);
    }
    throw error;
  }

  // The INSERT doesn't resolve `profiles.username`; we have it in the
  // session metadata only on the server, not here. The component that
  // renders the optimistic row knows the current user's display name,
  // so we leave `username` null here and let the caller enrich.
  const row = data as unknown as Omit<IncidentUpdateRawRow, 'username'>;
  return mapIncidentUpdate({ ...row, username: null });
}

export async function deleteMyIncidentUpdate(id: string): Promise<void> {
  const { error } = await supabase().from('incident_updates').delete().eq('id', id);
  if (error) throw error;
}
