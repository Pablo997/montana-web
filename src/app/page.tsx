import { SiteHeader } from '@/components/layout/SiteHeader';
import { MapView } from '@/components/map/MapView';

export default function HomePage() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="app-shell__main">
        <MapView />
      </main>
    </div>
  );
}
