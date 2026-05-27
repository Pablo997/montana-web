import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LegalPageLayout } from '@/components/layout/LegalPageLayout';
import { CookiesEn } from './_content/CookiesEn';
import { CookiesEs } from './_content/CookiesEs';

const LAST_UPDATED: Record<string, string> = {
  es: 'Abril 2026',
  en: 'April 2026',
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal');
  return {
    title: `${t('cookiesTitle')} — Montana`,
    description: 'Montana uses only strictly necessary cookies.',
  };
}

export default async function CookiesPage() {
  const locale = await getLocale();
  const t = await getTranslations('legal');
  const isSpanish = locale.toLowerCase().startsWith('es');
  return (
    <LegalPageLayout
      title={t('cookiesTitle')}
      lastUpdated={LAST_UPDATED[isSpanish ? 'es' : 'en']}
    >
      {isSpanish ? <CookiesEs /> : <CookiesEn />}
    </LegalPageLayout>
  );
}
