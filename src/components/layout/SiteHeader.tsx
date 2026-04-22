import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isCurrentUserAdmin } from '@/lib/admin/auth';
import { Logo } from '@/components/brand/Logo';
import { UserMenu } from './UserMenu';

export async function SiteHeader() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = user ? await isCurrentUserAdmin() : false;

  return (
    <header className="site-header">
      <Link href="/" className="site-header__brand" aria-label="Montana home">
        <Logo size={30} className="site-header__logo" />
        <span className="site-header__wordmark">Montana</span>
      </Link>

      <div className="site-header__actions">
        {user ? (
          <UserMenu email={user.email ?? 'Account'} isAdmin={isAdmin} />
        ) : (
          <Link href="/auth/sign-in" className="button button--primary">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
