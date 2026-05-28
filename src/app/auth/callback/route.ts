import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Exchanges the OTP / OAuth `code` for a session cookie and redirects back
 * to the originally-requested path (or home).
 *
 * Also runs the duplicate-account guard: if the freshly-created session
 * points to a NEW `auth.users` row that shares an email with an
 * existing account (the canonical "user signed in with Google on top of
 * a magic-link account" footgun), the guard discards the duplicate and
 * bounces the user back to `/auth/sign-in` with an explanation. They
 * can then sign in with their original method and use `/me → Linked
 * accounts` to attach the new provider intentionally.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirectTo = searchParams.get('redirect_to') ?? '/';

  if (!code) {
    return NextResponse.redirect(`${origin}${redirectTo}`);
  }

  const supabase = createSupabaseServerClient();
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(
      `${origin}/auth/sign-in?error=${encodeURIComponent(exchangeError.message)}`,
    );
  }

  // Duplicate-account guard. The RPC returns one of:
  //   * action: 'noop'      → nothing to do, session is fine
  //   * action: 'discarded' → duplicate row was deleted; sign-out + redirect
  //   * action: 'manual'    → duplicate row had data; sign-out + redirect
  // We treat the last two the same way from the route handler's point of
  // view: this session must not continue. The session is for a row that
  // either no longer exists (discarded) or whose owner needs to log in
  // via their original provider (manual).
  type GuardResult = {
    action?: 'noop' | 'discarded' | 'manual';
    email?: string;
  };
  const { data: rawGuard, error: guardError } = await supabase.rpc(
    'discard_duplicate_account_for_email',
  );

  if (!guardError) {
    const guard = (rawGuard ?? {}) as GuardResult;
    if (guard.action === 'discarded' || guard.action === 'manual') {
      // The current session may already be invalid (the row was
      // deleted under us). `signOut` is best-effort; even if it
      // throws because the JWT no longer resolves to a user we
      // still want to clear the cookies.
      try {
        await supabase.auth.signOut();
      } catch {
        // Intentionally swallowed — see comment above.
      }
      const params = new URLSearchParams({
        error: 'duplicate_email',
      });
      if (guard.email) params.set('email', guard.email);
      return NextResponse.redirect(
        `${origin}/auth/sign-in?${params.toString()}`,
      );
    }
  }
  // If the RPC itself errored (e.g. migration not yet applied on
  // a preview environment) we intentionally fall through and serve
  // the session as-is. The guard is "belt and braces"; the primary
  // user-facing protection is the linkIdentity flow on /me.

  return NextResponse.redirect(`${origin}${redirectTo}`);
}
