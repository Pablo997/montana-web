import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/layout/SiteHeader';

interface Props {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

/**
 * Shared chrome for `/privacy`, `/terms` and any future static legal /
 * informational page. Keeps content to one readable column and wires up
 * the same header as the rest of the app.
 *
 * RSC: we resolve "Back to map" and the "Last updated" label from the
 * `common.backToMap` + `legal.lastUpdated` namespaces. The `title` and
 * `lastUpdated` strings themselves are passed in by the caller so each
 * page can ship the localised version of its own metadata.
 */
export async function LegalPageLayout({ title, lastUpdated, children }: Props) {
  const tCommon = await getTranslations('common');
  const tLegal = await getTranslations('legal');
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="app-shell__main">
        <article className="legal">
          <header className="legal__header">
            <p className="legal__back">
              <Link href="/">&larr; {tCommon('backToMap')}</Link>
            </p>
            <h1 className="legal__title">{title}</h1>
            <p className="legal__updated">
              {tLegal('lastUpdated', { date: lastUpdated })}
            </p>
          </header>
          <div className="legal__body">{children}</div>
        </article>
      </main>
    </div>
  );
}
