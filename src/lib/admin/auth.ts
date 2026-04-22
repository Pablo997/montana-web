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
 * The admin check runs inside the DB via `public.is_admin()`, so this
 * function is a thin wrapper; the real policy lives with the data.
 */
export async function requireAdmin(nextPath = '/admin'): Promise<AdminSession> {
  const supabase = createSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const { data, error } = await supabase.rpc('is_admin');
  if (error || data !== true) {
    notFound();
  }

  return {
    userId: session.user.id,
    email: session.user.email ?? '',
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
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return false;

    const { data, error } = await supabase.rpc('is_admin');
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
