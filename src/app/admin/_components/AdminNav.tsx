'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

const TABS = [
  { href: '/admin', key: 'reports', exact: true },
  { href: '/admin/incidents', key: 'incidents', exact: false },
  { href: '/admin/bans', key: 'bans', exact: false },
  { href: '/admin/activity', key: 'activity', exact: false },
] as const;

/**
 * Small horizontal tab bar for the admin surface. Split into its own
 * client component so we can read `pathname` for the active state
 * without turning the whole layout into a client component.
 */
export function AdminNav() {
  const pathname = usePathname();
  const t = useTranslations('admin.nav');
  const tLayout = useTranslations('admin.layout');

  return (
    <nav className="admin-nav" aria-label={tLayout('navAria')}>
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
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
