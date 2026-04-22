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
 * session-level actions (sign out, delete account). Replaces the
 * previous plain "Sign out" button so we can fit the GDPR art. 17
 * erasure control without adding header clutter.
 */
export function UserMenu({ email, isAdmin = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<'signout' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
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
        setConfirming(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setConfirming(false);
      }
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

  const handleDelete = async () => {
    setError(null);
    setLoading('delete');

    // Delegate to the server route: it runs with the service role,
    // so it can bypass Supabase's storage-cascade trigger and fully
    // erase the account (media + DB rows + auth.users). Keeping this
    // flow server-side also means the service-role key never reaches
    // the browser.
    const res = await fetch('/api/me/delete', { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? 'Could not delete the account.');
      setLoading(null);
      return;
    }

    try {
      localStorage.removeItem('montana.consent');
      localStorage.removeItem('montana.notice.v1');
    } catch {
      /* ignore */
    }
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
        // `aria-label` means the icon-only collapsed state on mobile
        // still reads as "Account menu, logged in as <email>" in a
        // screen reader. The visible text is hidden at narrow widths
        // purely for layout, not for semantics.
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
          {!confirming ? (
            <>
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
              <div className="user-menu__divider" />
              <button
                type="button"
                className="user-menu__item user-menu__item--danger"
                role="menuitem"
                onClick={() => setConfirming(true)}
                disabled={loading !== null}
              >
                Delete my account
              </button>
            </>
          ) : (
            <div className="user-menu__confirm">
              <p className="user-menu__confirm-title">Delete your account?</p>
              <p className="user-menu__confirm-body">
                This permanently removes your profile, incidents, votes
                and uploaded photos. It cannot be undone. Type{' '}
                <strong>DELETE</strong> to confirm.
              </p>
              <input
                type="text"
                className="user-menu__confirm-input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                autoFocus
              />
              {error ? (
                <p className="user-menu__confirm-error">{error}</p>
              ) : null}
              <div className="user-menu__confirm-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setConfirming(false);
                    setConfirmText('');
                    setError(null);
                  }}
                  disabled={loading === 'delete'}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={handleDelete}
                  disabled={confirmText !== 'DELETE' || loading === 'delete'}
                >
                  {loading === 'delete' ? 'Deleting...' : 'Delete forever'}
                </button>
              </div>
            </div>
          )}
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
          // Temporarily close the modal so the map is fully visible,
          // request a pick through the shared channel, then reopen
          // with the new coords as the `initialCenter` override. If
          // the user cancels (Esc / banner Cancel), `resolvePick` is
          // called with null and we reopen the modal unchanged.
          setNotificationsOpen(false);
          const picked = await requestPushCenterPick();
          if (picked) setPickedCenter(picked);
          setNotificationsOpen(true);
        }}
      />
    </div>
  );
}
