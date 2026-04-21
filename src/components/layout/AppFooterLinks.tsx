import Link from 'next/link';

/**
 * Discreet legal footer overlaid on the map view. Kept compact and
 * translucent so it doesn't compete with map content or MapLibre's
 * own attribution control (which sits bottom-right).
 */
export function AppFooterLinks() {
  return (
    <nav className="app-footer-links" aria-label="Legal">
      <Link href="/privacy">Privacy</Link>
      <span aria-hidden="true">·</span>
      <Link href="/terms">Terms</Link>
      <span aria-hidden="true">·</span>
      <Link href="/cookies">Cookies</Link>
    </nav>
  );
}
