import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Logo } from '@/components/brand/Logo';
import { OfflineIndicator } from '@/components/pwa/OfflineIndicator';
import { UserMenu } from './UserMenu';

/**
 * Floating header for the map view. Instead of a full-width bar we
 * render two independent glass pills pinned to the top corners, so the
 * map stays truly full-bleed. Inspired by the Windy.com layout:
 * brand + info widget top-left, account controls top-right.
 *
 * For sub-pages that are not the map (privacy, terms, etc.) we keep
 * using `SiteHeader`, which provides the traditional header bar.
 */
export async function FloatingHeader() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <Link
        href="/"
        className="floating-header__brand"
        aria-label="Montana home"
      >
        <Logo size={42} className="floating-header__logo" />
        <span className="floating-header__wordmark">Montana</span>
      </Link>

      <div className="floating-header__actions">
        {user ? (
          <UserMenu email={user.email ?? 'Account'} />
        ) : (
          <Link href="/auth/sign-in" className="button button--primary">
            Sign in
          </Link>
        )}
      </div>

      <OfflineIndicator />
    </>
  );
}
