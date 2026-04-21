import { createClient } from '@supabase/supabase-js';

/**
 * Privileged, server-only Supabase client built with the service-role
 * key. Bypasses RLS and storage triggers.
 *
 * This MUST never be imported from code that runs in the browser. The
 * `import 'server-only'` directive makes Next.js throw at build time
 * if a client component transitively pulls it in.
 *
 * Used strictly for admin flows (account deletion, back-office tools).
 * Every normal read/write still goes through the user-scoped anon
 * client + RLS so we keep least-privilege by default.
 */
import 'server-only';

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to the server environment before using admin flows.',
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
