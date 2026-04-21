import Link from 'next/link';
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
 */
export function LegalPageLayout({ title, lastUpdated, children }: Props) {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="app-shell__main">
        <article className="legal">
          <header className="legal__header">
            <p className="legal__back">
              <Link href="/">&larr; Back to map</Link>
            </p>
            <h1 className="legal__title">{title}</h1>
            <p className="legal__updated">Last updated: {lastUpdated}</p>
          </header>
          <div className="legal__body">{children}</div>
        </article>
      </main>
    </div>
  );
}
