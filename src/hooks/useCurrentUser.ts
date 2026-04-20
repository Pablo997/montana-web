'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface CurrentUser {
  userId: string | null;
  /** True while the initial session check is in flight. */
  loading: boolean;
}

/**
 * Reactive source of truth for the logged-in user on the client.
 *
 * Uses `getSession()` (reads from localStorage, no network round-trip)
 * instead of `getUser()` (hits `/auth/v1/user` to revalidate the JWT).
 * RLS on the server is the authoritative gate, so for *UI decisions*
 * like "show vote buttons / hide for the author" a local read is fine
 * and avoids a per-component network request.
 *
 * `onAuthStateChange` keeps the hook reactive to sign-in / sign-out
 * events — e.g. right after the magic link callback.
 */
export function useCurrentUser(): CurrentUser {
  const [state, setState] = useState<CurrentUser>({ userId: null, loading: true });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setState({ userId: data.session?.user.id ?? null, loading: false });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ userId: session?.user.id ?? null, loading: false });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
