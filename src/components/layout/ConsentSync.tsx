'use client';

import { useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const STORAGE_KEY = 'montana.consent';

/**
 * Flushes a locally-stored consent acceptance to the server the first
 * time the user lands on the app with a valid session. Ensures we
 * always have durable, user-scoped proof of consent (GDPR art. 7.1)
 * even if the acceptance happened pre-auth on a different device's
 * localStorage.
 *
 * Rendered server-agnostically at the top of authenticated shells; a
 * single call per session is enough because `record_consent` is
 * idempotent (unique on user_id + version).
 */
export function ConsentSync() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch {
        return;
      }
      if (!raw) return;

      let parsed: { version?: string } | null = null;
      try {
        parsed = JSON.parse(raw) as { version?: string };
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      if (!parsed?.version) return;

      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { error } = await supabase.rpc('record_consent', {
        p_version: parsed.version,
        p_user_agent: navigator.userAgent,
      });

      if (!error) {
        // Keep the key but mark as synced so we don't retry forever.
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...parsed, syncedAt: new Date().toISOString() }),
        );
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
