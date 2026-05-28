import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { absoluteUrl } from '@/lib/seo/config';
import { NearbyList } from './_components/NearbyList';
/**
 * /nearby — text-first companion to the map page.
 *
 * Why this page exists:
 *
 *   * **Bad connections.** In the mountains the map's tile chain is
 *     useless under EDGE / 3G — by the time tiles paint, the user has
 *     left the cafe. A list of nearby incidents needs ~3 KB instead
 *     of ~3 MB.
 *
 *   * **Accessibility.** Screen readers cannot navigate a Leaflet/
 *     MapLibre canvas. Outdoor apps that only ship a map exclude every
 *     user who relies on assistive tech.
 *
 *   * **SEO.** Each incident card here is a real DOM node Google can
 *     crawl, complete with title, snippet and JSON-LD. The map's
 *     interactive canvas is invisible to robots.
 *
 *   * **Cost.** This page does not load any MapTiler tiles or fonts.
 *     A "nearby" session is ~0 MapTiler requests vs. 200-400 on the
 *     map. See `docs/COST.md` → MapTiler tiles.
 *
 * Render strategy:
 *
 *   * **Server component (this file)**: handles `<html>`/`<head>`,
 *     auth-aware header chrome, and the localised page shell. We
 *     intentionally do NOT preload any incidents server-side because
 *     the query depends on the user's geolocation, which is only
 *     available client-side.
 *
 *   * **Client component `<NearbyList />`**: prompts for location,
 *     calls `list_nearby_incidents`, renders the list. Lives below
 *     in `_components/`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nearby');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: absoluteUrl('/nearby') },
    openGraph: {
      title: t('metaTitle'),
      description: t('metaDescription'),
      type: 'website',
    },
  };
}

export const dynamic = 'force-dynamic';

export default async function NearbyPage() {
  const t = await getTranslations('nearby');

  return (
    <div className="nearby-page">
      <SiteHeader />

      <main className="nearby-page__main" id="main">
        <Link href="/" className="nearby-page__back button button--ghost">
          ← {t('backToMap')}
        </Link>

        <header className="nearby-page__header">
          <h1 className="nearby-page__title">{t('title')}</h1>
          <p className="nearby-page__lede">{t('lede')}</p>
        </header>
        <NearbyList />
      </main>
    </div>
  );
}
