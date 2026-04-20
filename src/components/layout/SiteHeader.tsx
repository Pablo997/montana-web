import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" className="site-header__brand">
        <span className="site-header__brand-mark" aria-hidden />
        <span>Montana</span>
      </Link>

      <div className="site-header__actions">
        <Link href="/auth/sign-in" className="button">
          Sign in
        </Link>
      </div>
    </header>
  );
}
