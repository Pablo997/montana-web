import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isCurrentUserAdmin } from '@/lib/admin/auth';
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
  const [
    {
      data: { user },
    },
    t,
  ] = await Promise.all([supabase.auth.getUser(), getTranslations('header')]);

  // Only pay for the admin lookup when we know we'll show a menu to begin
  // with. Anonymous users skip the RPC entirely.
  const isAdmin = user ? await isCurrentUserAdmin() : false;

  return (
    <>
      <Link
        href="/"
        className="floating-header__brand"
        aria-label={t('brandAriaLabel')}
      >
        <Logo size={42} className="floating-header__logo" />
        <span className="floating-header__wordmark">Montana</span>
      </Link>

      <div className="floating-header__actions">
        {user ? (
          <UserMenu email={user.email ?? 'Account'} isAdmin={isAdmin} />
        ) : (
          <Link href="/auth/sign-in" className="button button--primary">
            {t('signIn')}
          </Link>
        )}
      </div>

      <OfflineIndicator />
    </>
  );
}
