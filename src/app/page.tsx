import { SiteHeader } from '@/components/layout/SiteHeader';
import { AppFooterLinks } from '@/components/layout/AppFooterLinks';
import { LegalNotice } from '@/components/layout/LegalNotice';
import { ConsentSync } from '@/components/layout/ConsentSync';
import { MapView } from '@/components/map/MapView';

export default function HomePage() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="app-shell__main">
        <MapView />
        <AppFooterLinks />
      </main>
      <LegalNotice />
      <ConsentSync />
    </div>
  );
}
