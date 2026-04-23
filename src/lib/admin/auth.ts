import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface AdminSession {
  userId: string;
  email: string;
}

/**
 * Server-side admin gate. Used by the `/admin/*` routes to:
 *
 *   1. redirect anonymous users to `/login?next=/admin` so the magic-link
 *      flow returns them to where they were heading,
 *   2. 404 (rather than 403) authenticated non-admins — we don't want to
 *      leak the existence of an admin surface.
 *
 * Uses `getUser()` rather than `getSession()` because we're server-side
 * and reading the user id off a potentially-tampered cookie is the
 * exact footgun Supabase's own warning points at. `getUser()` hits
 * `/auth/v1/user` to verify the JWT signature against GoTrue; the
 * latency is irrelevant compared to the downstream RPC round-trip
 * we're about to make anyway.
 */
export async function requireAdmin(nextPath = '/admin'): Promise<AdminSession> {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const { data, error } = await supabase.rpc('is_admin');
  if (error || data !== true) {
    notFound();
  }

  return {
    userId: user.id,
    email: user.email ?? '',
  };
}

/**
 * Non-throwing variant for UI gating (e.g. show an "Admin" link in the
 * user menu). Returns `false` if anonymous, RPC fails, or not an admin.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase.rpc('is_admin');
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
