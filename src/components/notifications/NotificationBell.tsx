'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useNotifications } from '@/hooks/useNotifications';
import { useIncidentLabels } from '@/lib/incidents/useIncidentLabels';

interface Props {
  /**
   * Whether the current user is signed in. Anonymous users still get a
   * placeholder so the header layout doesn't reflow on sign-in, but the
   * hook short-circuits all network activity until `enabled` flips.
   */
  isAuthenticated: boolean;
}

/**
 * Bell button + dropdown for the in-app notification center.
 *
 * Render contract:
 *   * Anonymous users: invisible. The header link to sign-in already
 *     occupies the slot, and showing a "0 unread" bell to logged-out
 *     visitors invites the question "what would I see?" — wrong shape
 *     of curiosity to provoke.
 *   * Authenticated: the bell renders with an unread badge. Clicking
 *     opens a panel below it with the first 20 entries; subsequent
 *     pages load on scroll-to-bottom (deferred to v2 — most users
 *     have <20 unread).
 *
 * Accessibility:
 *   * Trigger uses `aria-expanded` + `aria-haspopup="menu"` so screen
 *     readers know it's a dropdown.
 *   * Items are `<Link>`s with explicit aria-labels combining incident
 *     title and severity, which is what a sighted user gets from the
 *     compound row anyway.
 *   * Escape and outside-click close the panel; tab order stays in the
 *     dropdown while open (no focus trap — the dropdown is short and
 *     the only escape is the underlying page).
 */
export function NotificationBell({ isAuthenticated }: Props) {
  const t = useTranslations('notifications');
  const labels = useIncidentLabels();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { items, unread, loading, refresh, markRead, markAllRead } =
    useNotifications({ enabled: isAuthenticated });

  // Lazy-load the list the first time the dropdown opens. Subsequent
  // opens reuse what's in memory; the realtime channel keeps the badge
  // honest in the meantime. Refreshing on every open would feel slick
  // but doubles RPC traffic for no real product win.
  const fetchedOnce = useRef(false);
  useEffect(() => {
    if (!open || fetchedOnce.current) return;
    fetchedOnce.current = true;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  if (!isAuthenticated) return null;

  // Cap the badge at "9+" to keep the bell compact. Past that the
  // exact number isn't useful — the user opens the panel anyway.
  const badgeText = unread === 0 ? null : unread > 9 ? '9+' : String(unread);

  return (
    <div className="notification-bell" ref={ref}>
      <button
        type="button"
        className="notification-bell__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          unread > 0
            ? t('triggerAriaLabelUnread', { count: unread })
            : t('triggerAriaLabel')
        }
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            d="M12 3a6 6 0 0 0-6 6v3.5L4 16h16l-2-3.5V9a6 6 0 0 0-6-6Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M10 19a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        {badgeText ? (
          <span className="notification-bell__badge" aria-hidden="true">
            {badgeText}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="notification-bell__panel" role="menu">
          <header className="notification-bell__header">
            <span className="notification-bell__title">{t('title')}</span>
            {unread > 0 ? (
              <button
                type="button"
                className="notification-bell__mark-all"
                onClick={() => void markAllRead()}
              >
                {t('markAllRead')}
              </button>
            ) : null}
          </header>

          {loading ? (
            <p className="notification-bell__status">{t('loading')}</p>
          ) : items.length === 0 ? (
            <p className="notification-bell__empty">{t('empty')}</p>
          ) : (
            <ul className="notification-bell__list">
              {items.map((n) => {
                const isUnread = n.readAt === null;
                return (
                  <li
                    key={n.id}
                    className={`notification-bell__item${
                      isUnread ? ' notification-bell__item--unread' : ''
                    }`}
                  >
                    <Link
                      href={`/incidents/${n.incidentId}`}
                      className="notification-bell__link"
                      role="menuitem"
                      onClick={() => {
                        void markRead(n.id);
                        setOpen(false);
                      }}
                      aria-label={t('itemAriaLabel', {
                        title: n.incident.title,
                        severity: labels.severity(n.incident.severity),
                      })}
                    >
                      <span
                        className={`notification-bell__dot notification-bell__dot--${n.incident.severity}`}
                        aria-hidden="true"
                      />
                      <span className="notification-bell__body">
                        <span className="notification-bell__item-title">
                          {n.incident.title}
                        </span>
                        <span className="notification-bell__meta">
                          {labels.type(n.incident.type)} ·{' '}
                          {labels.severity(n.incident.severity)} ·{' '}
                          {formatRelative(n.createdAt, t)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Lightweight relative-time formatter. Avoids dragging in date-fns
 * just for "5m ago" / "2h ago". Falls back to absolute date for
 * anything older than a week, where relative loses precision and the
 * absolute timestamp is more useful anyway.
 */
function formatRelative(
  iso: string,
  t: ReturnType<typeof useTranslations<'notifications'>>,
): string {
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return '';
  const diff = Date.now() - created;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return t('relativeJustNow');
  if (m < 60) return t('relativeMinutes', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('relativeHours', { count: h });
  const d = Math.floor(h / 24);
  if (d < 7) return t('relativeDays', { count: d });
  return new Date(iso).toLocaleDateString();
}
