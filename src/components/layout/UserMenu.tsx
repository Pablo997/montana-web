'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { NotificationSettings } from '@/components/push/NotificationSettings';
import { requestPick as requestPushCenterPick } from '@/lib/push/pickMode';
import { DEFAULT_CENTER } from '@/lib/mapbox/config';
import type { LatLng } from '@/types/incident';

interface Props {
  email: string;
  /**
   * When true the menu shows a direct link to `/admin`. The flag is resolved
   * server-side (via `isCurrentUserAdmin()`) so anonymous users pay nothing
   * and non-admins never receive the markup.
   */
  isAdmin?: boolean;
}

/**
 * Authenticated-user menu: shows the email as a trigger and exposes
 * session-level actions (profile, nearby alerts, admin, sign out).
 * Account deletion lives on the /me page under "Danger zone" — it is
 * irreversible and belongs in a setting-like context, not next to
 * everyday shortcuts.
 */
export function UserMenu({ email, isAdmin = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<'signout' | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // Holds the coords the user just picked on the map so that when we
  // reopen the notifications modal after the pick flow, the newly
  // picked point replaces the one loaded from the DB. Cleared as soon
  // as the modal consumes it to avoid "stuck" overrides.
  const [pickedCenter, setPickedCenter] = useState<LatLng | null>(null);
  const ref = useRef<HTMLDivElement>(null);

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

  const handleSignOut = async () => {
    setLoading('signout');
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu (${email})`}
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          className="user-menu__avatar"
        >
          <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M4.5 19.2c1.5-3.4 4.4-5.2 7.5-5.2s6 1.8 7.5 5.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span className="user-menu__email" title={email}>{email}</span>
        <svg
          aria-hidden="true"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className="user-menu__caret"
        >
          <path d="M1 3 L5 7 L9 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div className="user-menu__panel" role="menu">
          <Link
            href="/me"
            className="user-menu__item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            My profile
          </Link>
          <div className="user-menu__divider" />
          <button
            type="button"
            className="user-menu__item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setNotificationsOpen(true);
            }}
            disabled={loading !== null}
          >
            Nearby alerts…
          </button>
          {isAdmin ? (
            <>
              <div className="user-menu__divider" />
              <Link
                href="/admin"
                className="user-menu__item user-menu__item--admin"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                Moderation panel
              </Link>
            </>
          ) : null}
          <div className="user-menu__divider" />
          <button
            type="button"
            className="user-menu__item"
            role="menuitem"
            onClick={handleSignOut}
            disabled={loading !== null}
          >
            {loading === 'signout' ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      ) : null}

      <NotificationSettings
        open={notificationsOpen}
        onClose={() => {
          setNotificationsOpen(false);
          setPickedCenter(null);
        }}
        defaultCenter={{ lat: DEFAULT_CENTER[1], lng: DEFAULT_CENTER[0] }}
        initialCenter={pickedCenter}
        onPickOnMap={async () => {
          setNotificationsOpen(false);
          const picked = await requestPushCenterPick();
          if (picked) setPickedCenter(picked);
          setNotificationsOpen(true);
        }}
      />
    </div>
  );
}
