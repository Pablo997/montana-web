import { FloatingHeader } from '@/components/layout/FloatingHeader';
import { AppFooterLinks } from '@/components/layout/AppFooterLinks';
import { LegalNotice } from '@/components/layout/LegalNotice';
import { ConsentSync } from '@/components/layout/ConsentSync';
import { MapView } from '@/components/map/MapView';
import { PushOnboardingBanner } from '@/components/push/PushOnboardingBanner';
import { OnboardingTour } from '@/components/onboarding/OnboardingTour';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function HomePage() {
  // Resolve the auth state server-side so the onboarding tour only
  // mounts (and only flips the localStorage flag) for actual
  // signed-in users. Anonymous visitors never see it.
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="map-shell">
      <MapView />
      <FloatingHeader />
      <PushOnboardingBanner />
      <AppFooterLinks />
      <LegalNotice />
      <ConsentSync />
      <OnboardingTour enabled={Boolean(user)} />
    </div>
  );
}
