'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { track } from '@/lib/analytics/track';

/**
 * "Preferences" section on /me. Currently houses only the
 * "Restart guided tour" action, but it's structured as a multi-row
 * card so future preferences (theme, default basemap, …) drop in
 * without restructuring the page.
 */
export function Preferences() {
  const t = useTranslations('profile.preferences');
  const router = useRouter();
  const resetTour = useOnboardingStore((s) => s.reset);
  const [restarted, setRestarted] = useState(false);

  const handleRestartTour = () => {
    resetTour();
    setRestarted(true);
    track('tour_restarted');
    // Bounce to the map so the user can immediately see the tour
    // run again. router.refresh() isn't enough — the tour reads
    // the persisted flag during its mount effect, so we want a
    // full navigation that remounts the page.
    setTimeout(() => router.push('/'), 350);
  };

  return (
    <section className="profile-section preferences" aria-labelledby="preferences-title">
      <div className="profile-section__head">
        <h2 id="preferences-title" className="profile-section__title">
          {t('title')}
        </h2>
      </div>

      <div className="preferences__row">
        <div className="preferences__meta">
          <p className="preferences__name">{t('restartTourTitle')}</p>
          <p className="preferences__description">
            {t('restartTourDescription')}
          </p>
        </div>
        <button
          type="button"
          className="button button--ghost"
          onClick={handleRestartTour}
          disabled={restarted}
        >
          {restarted ? t('restarting') : t('restartTour')}
        </button>
      </div>
    </section>
  );
}
