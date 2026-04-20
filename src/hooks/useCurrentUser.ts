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
 * We combine a one-shot `getUser()` on mount with `onAuthStateChange` so
 * the hook reflects live sign-in / sign-out events (e.g. after the magic
 * link callback) without requiring a full page reload.
 */
export function useCurrentUser(): CurrentUser {
  const [state, setState] = useState<CurrentUser>({ userId: null, loading: true });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setState({ userId: data.user?.id ?? null, loading: false });
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
