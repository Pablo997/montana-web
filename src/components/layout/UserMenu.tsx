'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { NotificationSettings } from '@/components/push/NotificationSettings';
import { DEFAULT_CENTER } from '@/lib/mapbox/config';

interface Props {
  email: string;
}

/**
 * Authenticated-user menu: shows the email as a trigger and exposes
 * session-level actions (sign out, delete account). Replaces the
 * previous plain "Sign out" button so we can fit the GDPR art. 17
 * erasure control without adding header clutter.
 */
export function UserMenu({ email }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<'signout' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
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
      >
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
        onClose={() => setNotificationsOpen(false)}
        defaultCenter={{ lat: DEFAULT_CENTER[1], lng: DEFAULT_CENTER[0] }}
      />
    </div>
  );
}
