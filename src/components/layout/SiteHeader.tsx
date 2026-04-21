import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Logo } from '@/components/brand/Logo';
import { SignOutButton } from './SignOutButton';

export async function SiteHeader() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="site-header">
      <Link href="/" className="site-header__brand" aria-label="Montana home">
        <Logo size={30} className="site-header__logo" />
        <span className="site-header__wordmark">Montana</span>
      </Link>

      <div className="site-header__actions">
        {user ? (
          <>
            <span className="site-header__user" title={user.email ?? ''}>
              {user.email}
            </span>
            <SignOutButton />
          </>
        ) : (
          <Link href="/auth/sign-in" className="button button--primary">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
