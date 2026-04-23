import type { Metadata } from 'next';

// `/auth/*` routes wrap the magic-link flow. They're intentionally
// kept out of search indices because:
//   * The URLs carry ephemeral tokens (`?code=...`) that shouldn't be
//     cached or shared publicly.
//   * There's nothing in here that a searcher would want to find
//     directly — they land via an email or a redirect.
//
// `robots.index: false` emits the meta tag; the global robots.txt
// already blocks `/auth/` at crawl time for belt-and-braces.
export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
