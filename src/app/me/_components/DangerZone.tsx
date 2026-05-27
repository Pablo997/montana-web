'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * GDPR art. 17 "right to erasure" control on the profile page.
 *
 * The actual delete runs through `/api/me/delete`, which uses the service
 * role key to wipe media, DB rows and `auth.users` in one transaction.
 * We keep the key server-side; this component is purely UX + confirmation.
 */
export function DangerZone() {
  const t = useTranslations('profile.dangerZone');
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
      setError(body?.error ?? t('deleteError'));
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
          {t('title')}
        </h2>
        <p className="danger-zone__subtitle">{t('subtitle')}</p>
      </header>

      {!confirming ? (
        <div className="danger-zone__row">
          <div>
            <h3 className="danger-zone__row-title">{t('rowTitle')}</h3>
            <p className="danger-zone__row-body">{t('rowBody')}</p>
          </div>
          <button
            type="button"
            className="button button--ghost-danger"
            onClick={() => setConfirming(true)}
          >
            {t('deleteCta')}
          </button>
        </div>
      ) : (
        <div className="danger-zone__confirm">
          <p className="danger-zone__confirm-body">
            {t.rich('confirmBody', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <input
            type="text"
            className="danger-zone__confirm-input"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={t('confirmPlaceholder')}
            autoFocus
            aria-label={t('confirmInputAria')}
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
              {t('cancel')}
            </button>
            <button
              type="button"
              className="button button--danger"
              onClick={handleDelete}
              disabled={confirmText !== 'DELETE' || loading}
            >
              {loading ? t('deleting') : t('deleteFinal')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
