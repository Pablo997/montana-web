'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationsRead,
  type AppNotification,
} from '@/lib/notifications/client';

interface State {
  /** Loaded page of notifications, newest first. */
  items: AppNotification[];
  /** Count of unread items across the entire feed (not just loaded page). */
  unread: number;
  /** True while a fetch is in flight. */
  loading: boolean;
  error: string | null;
}

/**
 * Bell dropdown's data layer. Three responsibilities:
 *
 *   1. Load the current page on demand (open the dropdown ⇒ first fetch).
 *      Anonymous users skip both the RPC and the realtime channel — RLS
 *      would refuse them anyway, but short-circuiting saves a Network tab
 *      full of 401s in the dev console.
 *   2. Keep the unread badge fresh in real time via Supabase Realtime
 *      `postgres_changes` on `public.notifications`. We filter
 *      server-side by `user_id` so the channel only ships rows the
 *      RLS policy would have allowed anyway — defence in depth.
 *   3. Optimistic mark-as-read: the UI updates immediately, the RPC
 *      catches up. If the network fails we rollback (rare, but the
 *      alternative is "click did nothing", which feels broken).
 *
 * `enabled` lets the caller gate the whole subscription on auth state
 * without conditional hook calls. When the user signs out the parent
 * passes `false` and the hook cleanly unsubscribes.
 */
export function useNotifications({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<State>({
    items: [],
    unread: 0,
    loading: false,
    error: null,
  });
  /**
   * Stable mirror used inside Realtime callbacks. Reading from `state`
   * directly would close over the value at subscribe time and miss
   * subsequent updates. A ref keeps the callback referentially stable
   * (no resubscribe storm) while always seeing the latest data.
   */
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [items, unread] = await Promise.all([
        fetchNotifications(),
        fetchUnreadCount(),
      ]);
      setState({ items, unread, loading: false, error: null });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load notifications.',
      }));
    }
  }, [enabled]);

  // Initial badge fetch when the hook becomes enabled (e.g. after the
  // user signs in). The full list waits until the dropdown opens —
  // there's no point shipping it on every page render when most users
  // never click the bell.
  useEffect(() => {
    if (!enabled) {
      setState({ items: [], unread: 0, loading: false, error: null });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const unread = await fetchUnreadCount();
        if (!cancelled) setState((s) => ({ ...s, unread }));
      } catch {
        // Badge is best-effort. A failed fetch leaves the count at 0,
        // which under-counts rather than over-counts — preferable to
        // an alarming red dot the user can't explain.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // Realtime subscription. One channel per hook instance; the cleanup
  // function tears it down on unmount or when `enabled` flips false.
  //
  // Two non-obvious bits here:
  //
  //   1. The channel topic is suffixed with a per-mount nonce. Without
  //      it, React StrictMode's mount → unmount → mount sequence races
  //      with the async session fetch: mount #2 calls
  //      `supabase.channel('notifications-<uid>')` while mount #1's
  //      already-subscribed channel is still cached under that topic,
  //      and supabase-js rejects the subsequent `.on()` with
  //      "cannot add postgres_changes callbacks after subscribe()".
  //      A unique suffix sidesteps the topic-name collision entirely.
  //   2. We track a `cancelled` flag *and* a captured channel ref so
  //      that if the cleanup fires before the async IIFE creates the
  //      channel, the post-creation branch will still tear it down
  //      instead of leaking a subscription.
  useEffect(() => {
    if (!enabled) return;
    const supabase = createSupabaseBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      // We need the user's id to filter the postgres_changes channel
      // by `user_id`. The session is the cheapest way to grab it
      // client-side without a network round-trip.
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;
      const userId = sessionData.session?.user.id;
      if (!userId) return;

      // Per-instance topic suffix. `crypto.randomUUID()` is available
      // on every browser we support (Chrome 92+, Safari 15.4+); a
      // numeric timestamp fallback would be racier in StrictMode where
      // both effects can run within the same millisecond.
      const nonce =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const ch = supabase
        .channel(`notifications-${userId}-${nonce}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            // New row arrived. Bump the badge optimistically — refreshing
            // the full list only when the dropdown is open is handled
            // by the caller via `refresh()`. For the badge alone we
            // don't even need the payload contents.
            setState((s) => ({ ...s, unread: s.unread + 1 }));
          },
        )
        .subscribe();

      // Race: if the effect was cleaned up between our `await` and
      // here, the cleanup ran before `channel` got assigned and the
      // subscription would leak. Tear it down ourselves.
      if (cancelled) {
        supabase.removeChannel(ch);
        return;
      }
      channel = ch;
    })();

    return () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [enabled]);

  const markRead = useCallback(async (id: string) => {
    const current = stateRef.current;
    const target = current.items.find((n) => n.id === id);
    if (!target || target.readAt) return;
    // Optimistic update first so the UI feels instant.
    const optimisticReadAt = new Date().toISOString();
    setState((s) => ({
      ...s,
      items: s.items.map((n) =>
        n.id === id ? { ...n, readAt: optimisticReadAt } : n,
      ),
      unread: Math.max(0, s.unread - 1),
    }));
    try {
      await markNotificationsRead([id]);
    } catch {
      // Rollback. The bump-the-badge-back-up case is rare enough that
      // we accept the visual flicker rather than silently swallowing
      // the failure (which would make the unread state lie).
      setState((s) => ({
        ...s,
        items: s.items.map((n) =>
          n.id === id ? { ...n, readAt: target.readAt } : n,
        ),
        unread: s.unread + 1,
      }));
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const current = stateRef.current;
    if (current.unread === 0) return;
    const optimisticReadAt = new Date().toISOString();
    const previous = current.items;
    setState((s) => ({
      ...s,
      items: s.items.map((n) =>
        n.readAt ? n : { ...n, readAt: optimisticReadAt },
      ),
      unread: 0,
    }));
    try {
      await markAllNotificationsRead();
    } catch {
      setState((s) => ({ ...s, items: previous, unread: current.unread }));
    }
  }, []);

  return {
    items: state.items,
    unread: state.unread,
    loading: state.loading,
    error: state.error,
    refresh,
    markRead,
    markAllRead,
  };
}
