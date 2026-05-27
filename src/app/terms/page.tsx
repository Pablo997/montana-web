import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LegalPageLayout } from '@/components/layout/LegalPageLayout';
import { TermsEn } from './_content/TermsEn';
import { TermsEs } from './_content/TermsEs';

const LAST_UPDATED: Record<string, string> = {
  es: 'Abril 2026 (añadidos moderación y EXIF)',
  en: 'April 2026 (moderation & EXIF added)',
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal');
  return {
    title: `${t('termsTitle')} — Montana`,
    description: 'Rules for using Montana.',
  };
}

export default async function TermsPage() {
  const locale = await getLocale();
  const t = await getTranslations('legal');
  const isSpanish = locale.toLowerCase().startsWith('es');
  return (
    <LegalPageLayout
      title={t('termsTitle')}
      lastUpdated={LAST_UPDATED[isSpanish ? 'es' : 'en']}
    >
      {isSpanish ? <TermsEs /> : <TermsEn />}
    </LegalPageLayout>
  );
}
