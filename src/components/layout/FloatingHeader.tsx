import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isCurrentUserAdmin } from '@/lib/admin/auth';
import { Logo } from '@/components/brand/Logo';
import { OfflineIndicator } from '@/components/pwa/OfflineIndicator';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { UserMenu } from './UserMenu';
import { LocaleSwitcher } from './LocaleSwitcher';

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
        <Logo size={50} className="floating-header__logo" />
        <span className="floating-header__wordmark">Montana</span>
      </Link>

      <div className="floating-header__actions">
        {user ? (
          <>
            <NotificationBell isAuthenticated={true} />
            <UserMenu email={user.email ?? 'Account'} isAdmin={isAdmin} />
          </>
        ) : (
          <>
            {/* Anonymous visitors still need to be able to switch
                language — they're the ones most likely to land here
                in the "wrong" locale via a shared link or a search
                engine, and the legal pages (privacy / terms / cookies)
                are localised so the choice must be available BEFORE
                signing in. */}
            <LocaleSwitcher />
            <Link
              href="/auth/sign-in"
              className="button button--primary sign-in-cta"
              aria-label={t('signIn')}
            >
              <SignInIcon />
              <span className="sign-in-cta__label">{t('signIn')}</span>
            </Link>
          </>
        )}
      </div>

      <OfflineIndicator />
    </>
  );
}

/**
 * Login glyph (person silhouette + right-arrow). Inlined as SVG so
 * the button works offline and so the icon scales cleanly with the
 * surrounding pill. Lucide-style line weight to match the rest of
 * the icons we use across the header.
 */
function SignInIcon() {
  return (
    <svg
      aria-hidden="true"
      className="sign-in-cta__icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}
