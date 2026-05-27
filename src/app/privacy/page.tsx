import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LegalPageLayout } from '@/components/layout/LegalPageLayout';
import { PrivacyEn } from './_content/PrivacyEn';
import { PrivacyEs } from './_content/PrivacyEs';

/**
 * Localised "Last updated" string per supported locale. Kept inline
 * (instead of in `messages/*.json`) because:
 *   * legal pages are SEO-indexed RSCs — having the literal here means
 *     the string never has to round-trip through the next-intl loader,
 *     which is one less thing that can go wrong at build time;
 *   * a date stamp shows up once per page and rarely changes, so the
 *     duplication burden is negligible.
 */
const LAST_UPDATED: Record<string, string> = {
  es: 'Abril 2026 (añadidos moderación y EXIF)',
  en: 'April 2026 (moderation & EXIF added)',
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal');
  const tMeta = await getTranslations('error');
  // `tMeta` keeps a few generic fallbacks if the legal namespace ever
  // misses a key — defensive, not strictly required today.
  void tMeta;
  return {
    title: `${t('privacyTitle')} — Montana`,
    description:
      'How Montana collects, uses and protects your data.', // kept neutral to stay valid for both locales at indexation time.
  };
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  const t = await getTranslations('legal');
  const isSpanish = locale.toLowerCase().startsWith('es');
  return (
    <LegalPageLayout
      title={t('privacyTitle')}
      lastUpdated={LAST_UPDATED[isSpanish ? 'es' : 'en']}
    >
      {isSpanish ? <PrivacyEs /> : <PrivacyEn />}
    </LegalPageLayout>
  );
}
