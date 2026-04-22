'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin', label: 'Reports', exact: true },
  { href: '/admin/incidents', label: 'Incidents', exact: false },
  { href: '/admin/bans', label: 'Bans', exact: false },
  { href: '/admin/activity', label: 'Activity', exact: false },
];

/**
 * Small horizontal tab bar for the admin surface. Split into its own
 * client component so we can read `pathname` for the active state
 * without turning the whole layout into a client component.
 */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="Moderation sections">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`admin-nav__link${active ? ' admin-nav__link--active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
