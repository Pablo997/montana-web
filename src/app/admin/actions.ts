'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';

export interface AdminActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Normalises a Supabase error into a stable, user-friendly message.
 * The DB raises our domain errors (`NOT_ADMIN`, `CANNOT_BAN_SELF`, …)
 * as exception messages; we map them here so the UI can stay dumb.
 */
function explain(error: unknown): string {
  const msg =
    (error as { message?: string })?.message ?? 'Unexpected error';
  if (msg.includes('NOT_ADMIN')) return 'You are not an administrator.';
  if (msg.includes('REPORT_NOT_FOUND')) return 'Report no longer exists.';
  if (msg.includes('INCIDENT_NOT_FOUND')) return 'Incident no longer exists.';
  if (msg.includes('CANNOT_BAN_SELF')) return 'You cannot ban yourself.';
  if (msg.includes('CANNOT_BAN_ADMIN'))
    return 'Remove admin rights before banning this user.';
  return msg;
}

export async function dismissReport(
  reportId: string,
  reason: string | null = null,
): Promise<AdminActionResult> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_dismiss_report', {
    p_report_id: reportId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: explain(error) };
  revalidatePath('/admin');
  revalidatePath('/admin/incidents');
  revalidatePath('/admin/activity');
  return { ok: true };
}

export async function removeIncident(
  incidentId: string,
  reason: string,
): Promise<AdminActionResult> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_remove_incident', {
    p_incident_id: incidentId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: explain(error) };
  revalidatePath('/admin');
  revalidatePath('/admin/incidents');
  revalidatePath('/admin/activity');
  return { ok: true };
}

export async function restoreIncident(
  incidentId: string,
  reason: string | null = null,
): Promise<AdminActionResult> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_restore_incident', {
    p_incident_id: incidentId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: explain(error) };
  revalidatePath('/admin');
  revalidatePath('/admin/incidents');
  revalidatePath('/admin/activity');
  return { ok: true };
}

export async function banUser(
  userId: string,
  reason: string,
  /** Interval string accepted by Postgres, e.g. "7 days", "1 month". Null = permanent. */
  duration: string | null = null,
): Promise<AdminActionResult> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_ban_user', {
    p_user_id: userId,
    p_reason: reason,
    p_duration: duration,
  });
  if (error) return { ok: false, error: explain(error) };
  revalidatePath('/admin');
  revalidatePath('/admin/bans');
  revalidatePath('/admin/activity');
  return { ok: true };
}

export async function unbanUser(
  userId: string,
  reason: string | null = null,
): Promise<AdminActionResult> {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_unban_user', {
    p_user_id: userId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: explain(error) };
  revalidatePath('/admin/bans');
  revalidatePath('/admin/activity');
  return { ok: true };
}
