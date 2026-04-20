import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client. Safe to import from Client Components.
 * Uses the public anon key; all access is gated by RLS policies.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
