import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminNav } from './_components/AdminNav';

export const metadata: Metadata = {
  title: 'Admin · Montana',
  robots: { index: false, follow: false },
};

// Every admin page runs on each request: moderation data is mutable and
// we never want a stale audit feed.
export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guard runs once per request; `notFound()` for non-admins is surfaced
  // by Next.js as a standard 404, so the surface is invisible to them.
  await requireAdmin();

  return (
    <div className="admin-shell">
      <header className="admin-shell__header">
        <div className="admin-shell__brand">
          <Link href="/" className="admin-shell__home" aria-label="Back to map">
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M10 3 L5 8 L10 13"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Map
          </Link>
          <span className="admin-shell__title">Moderation</span>
        </div>
        <AdminNav />
      </header>
      <main className="admin-shell__main">{children}</main>
    </div>
  );
}
