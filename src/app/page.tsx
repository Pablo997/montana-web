import { FloatingHeader } from '@/components/layout/FloatingHeader';
import { AppFooterLinks } from '@/components/layout/AppFooterLinks';
import { LegalNotice } from '@/components/layout/LegalNotice';
import { ConsentSync } from '@/components/layout/ConsentSync';
import { MapView } from '@/components/map/MapView';
import { PushOnboardingBanner } from '@/components/push/PushOnboardingBanner';

export default function HomePage() {
  return (
    <div className="map-shell">
      <MapView />
      <FloatingHeader />
      <PushOnboardingBanner />
      <AppFooterLinks />
      <LegalNotice />
      <ConsentSync />
    </div>
  );
}
