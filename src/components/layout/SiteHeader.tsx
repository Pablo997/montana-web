import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isCurrentUserAdmin } from '@/lib/admin/auth';
import { Logo } from '@/components/brand/Logo';
import { UserMenu } from './UserMenu';
import { LocaleSwitcher } from './LocaleSwitcher';

export async function SiteHeader() {
  const supabase = createSupabaseServerClient();
  const [
    {
      data: { user },
    },
    t,
  ] = await Promise.all([supabase.auth.getUser(), getTranslations('header')]);
  const isAdmin = user ? await isCurrentUserAdmin() : false;

  return (
    <header className="site-header">
      <Link
        href="/"
        className="site-header__brand"
        aria-label={t('brandAriaLabel')}
      >
        <Logo size={36} className="site-header__logo" />
        <span className="site-header__wordmark">Montana</span>
      </Link>

      {/* Discoverability link to the text-first /nearby list. We expose
          it everywhere SiteHeader is rendered (profile, legal pages)
          so the page isn't only reachable from the map FAB. Visually
          subdued to keep the brand and the auth CTA dominant. */}
      <nav className="site-header__nav" aria-label={t('primaryNavAria')}>
        <Link href="/nearby" className="site-header__nav-link">
          {t('navNearby')}
        </Link>
      </nav>

      <div className="site-header__actions">
        {user ? (
          <UserMenu email={user.email ?? 'Account'} isAdmin={isAdmin} />
        ) : (
          <>
            {/* See comment in FloatingHeader: anonymous users land on
                /privacy or /terms via search engines and need to be
                able to flip language before any other action. */}
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
    </header>
  );
}

/**
 * Login glyph (person silhouette + right-arrow). Duplicated from
 * FloatingHeader on purpose — both headers are RSCs so a shared
 * `'use client'` icon component would force them through the client
 * boundary needlessly. The SVG body is tiny so the duplication cost
 * is lower than the ceremony of a shared package.
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
