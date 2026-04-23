'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { captureServerError } from '@/lib/observability/sentry';

export interface AdminActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Domain error codes that the DB raises on expected business-rule
 * violations (e.g. trying to ban yourself). We want these visible in
 * the UI but *silent* in Sentry — they aren't bugs, they're deliberate
 * guard rails firing correctly.
 */
const DOMAIN_ERROR_TOKENS = [
  'NOT_ADMIN',
  'REPORT_NOT_FOUND',
  'INCIDENT_NOT_FOUND',
  'CANNOT_BAN_SELF',
  'CANNOT_BAN_ADMIN',
];

function isDomainError(msg: string): boolean {
  return DOMAIN_ERROR_TOKENS.some((t) => msg.includes(t));
}

/**
 * Normalises a Supabase error into a stable, user-friendly message.
 * The DB raises our domain errors (`NOT_ADMIN`, `CANNOT_BAN_SELF`, …)
 * as exception messages; we map them here so the UI can stay dumb.
 *
 * Any error that is NOT one of our domain codes is an *infrastructure*
 * failure (network blip, broken RPC, misconfigured RLS) and gets
 * reported to Sentry with the action tag so it shows up in the right
 * bucket.
 */
function explain(error: unknown, tag: string): string {
  const msg = (error as { message?: string })?.message ?? 'Unexpected error';
  if (!isDomainError(msg)) {
    captureServerError(error, { tag, extras: { message: msg } });
  }
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
  if (error) return { ok: false, error: explain(error, 'admin.dismissReport') };
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
  if (error) return { ok: false, error: explain(error, 'admin.removeIncident') };
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
  if (error) return { ok: false, error: explain(error, 'admin.restoreIncident') };
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
  if (error) return { ok: false, error: explain(error, 'admin.banUser') };
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
  if (error) return { ok: false, error: explain(error, 'admin.unbanUser') };
  revalidatePath('/admin/bans');
  revalidatePath('/admin/activity');
  return { ok: true };
}
