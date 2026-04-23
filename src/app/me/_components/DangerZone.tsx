'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * GDPR art. 17 "right to erasure" control on the profile page.
 *
 * The actual delete runs through `/api/me/delete`, which uses the service
 * role key to wipe media, DB rows and `auth.users` in one transaction.
 * We keep the key server-side; this component is purely UX + confirmation.
 */
export function DangerZone() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setError(null);
    setLoading(true);

    const res = await fetch('/api/me/delete', { method: 'POST' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? 'Could not delete the account.');
      setLoading(false);
      return;
    }

    // Clear PWA-level consent flags so a re-registration starts from a
    // clean slate rather than silently reusing the old user's choices.
    try {
      localStorage.removeItem('montana.consent');
      localStorage.removeItem('montana.notice.v1');
    } catch {
      /* ignore */
    }

    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  };

  return (
    <section className="danger-zone" aria-labelledby="danger-zone-title">
      <header className="danger-zone__head">
        <h2 id="danger-zone-title" className="danger-zone__title">
          Danger zone
        </h2>
        <p className="danger-zone__subtitle">
          Permanent actions that cannot be undone.
        </p>
      </header>

      {!confirming ? (
        <div className="danger-zone__row">
          <div>
            <h3 className="danger-zone__row-title">Delete my account</h3>
            <p className="danger-zone__row-body">
              Removes your profile, every incident you reported, your
              votes and all uploaded photos. Other users will see your
              incidents as authored by a deleted account.
            </p>
          </div>
          <button
            type="button"
            className="button button--ghost-danger"
            onClick={() => setConfirming(true)}
          >
            Delete account
          </button>
        </div>
      ) : (
        <div className="danger-zone__confirm">
          <p className="danger-zone__confirm-body">
            This permanently removes your profile, incidents, votes and
            uploaded photos. It cannot be undone. Type <strong>DELETE</strong>{' '}
            to confirm.
          </p>
          <input
            type="text"
            className="danger-zone__confirm-input"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoFocus
            aria-label="Type DELETE to confirm"
          />
          {error ? <p className="danger-zone__error">{error}</p> : null}
          <div className="danger-zone__confirm-actions">
            <button
              type="button"
              className="button"
              onClick={() => {
                setConfirming(false);
                setConfirmText('');
                setError(null);
              }}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={handleDelete}
              disabled={confirmText !== 'DELETE' || loading}
            >
              {loading ? 'Deleting…' : 'Delete forever'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
