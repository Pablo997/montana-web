'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const STORAGE_KEY = 'montana.notice.v1';

/**
 * First-visit informational notice. This is NOT a cookie-consent
 * banner: we only use strictly necessary cookies, which under LSSI
 * art. 22.2 / ePrivacy art. 5(3) do not require prior consent. The
 * notice simply surfaces the legal links once so users who never
 * reach the sign-in flow (anonymous browsing) still have a clear
 * entry point to our policies.
 *
 * Dismissal state is stored in localStorage with a versioned key so
 * we can re-surface the notice if the policies materially change.
 */
export function LegalNotice() {
  const t = useTranslations('legal.notice');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage disabled (private mode in some browsers). Don't
      // block UX: just skip the notice entirely.
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ dismissedAt: new Date().toISOString() }),
      );
    } catch {
      /* non-fatal */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="legal-notice" role="region" aria-label={t('regionLabel')}>
      <div className="legal-notice__body">
        {t.rich('body', {
          strong: (chunks) => <strong>{chunks}</strong>,
          privacy: (chunks) => <Link href="/privacy">{chunks}</Link>,
          terms: (chunks) => <Link href="/terms">{chunks}</Link>,
          cookies: (chunks) => <Link href="/cookies">{chunks}</Link>,
        })}
      </div>
      <button
        type="button"
        className="legal-notice__dismiss"
        onClick={dismiss}
        aria-label={t('dismissAriaLabel')}
      >
        {t('dismiss')}
      </button>
    </div>
  );
}
