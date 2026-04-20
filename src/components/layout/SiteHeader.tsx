import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SignOutButton } from './SignOutButton';

export async function SiteHeader() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="site-header">
      <Link href="/" className="site-header__brand">
        <span className="site-header__brand-mark" aria-hidden />
        <span>Montana</span>
      </Link>

      <div className="site-header__actions">
        {user ? (
          <>
            <span className="site-header__user">{user.email}</span>
            <SignOutButton />
          </>
        ) : (
          <Link href="/auth/sign-in" className="button">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
