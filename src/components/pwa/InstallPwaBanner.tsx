'use client';

import { useTranslations } from 'next-intl';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

/**
 * "Add to home screen" nudge. Surfaces from the user's second visit on
 * a phone/tablet, once: either driving Chromium's native install prompt
 * or, on iOS Safari (which has no programmatic prompt), showing the
 * manual Share → "Add to Home Screen" steps.
 *
 * All lifecycle / eligibility lives in `useInstallPrompt`; this stays a
 * dumb renderer.
 */
export function InstallPwaBanner() {
  const t = useTranslations('pwa.installBanner');
  const { visible, mode, promptInstall, snooze, dismissForever } =
    useInstallPrompt();

  if (!visible) return null;

  return (
    <aside className="pwa-install" role="region" aria-label={t('regionAria')}>
      <span className="pwa-install__icon" aria-hidden>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3v11m0 0 4-4m-4 4-4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <div className="pwa-install__copy">
        <p className="pwa-install__heading">{t('heading')}</p>
        <p className="pwa-install__body">
          {mode === 'ios' ? t('iosBody') : t('body')}
        </p>
      </div>

      <div className="pwa-install__actions">
        <button type="button" className="button" onClick={snooze}>
          {t('notNow')}
        </button>
        {mode === 'native' ? (
          <button
            type="button"
            className="button button--primary"
            onClick={promptInstall}
          >
            {t('install')}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        className="pwa-install__dismiss"
        onClick={dismissForever}
        aria-label={t('dismissForever')}
        title={t('dismissForever')}
      >
        ×
      </button>
    </aside>
  );
}
