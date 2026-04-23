'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMapStore } from '@/store/useMapStore';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { LatLng } from '@/types/incident';

interface Props {
  fallbackLocation: LatLng;
}

export function ReportIncidentButton({ fallbackLocation }: Props) {
  const t = useTranslations('incident.form');
  const router = useRouter();
  const openReport = useMapStore((s) => s.openReport);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setAuthed(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleClick = () => {
    if (authed === false) {
      router.push('/auth/sign-in');
      return;
    }
    openReport(fallbackLocation);
  };

  return (
    <button
      type="button"
      className="report-button"
      onClick={handleClick}
      aria-label={t('title')}
      title={t('title')}
    >
      <span aria-hidden>＋</span>
      <span className="report-button__label">{t('shortCta')}</span>
    </button>
  );
}
