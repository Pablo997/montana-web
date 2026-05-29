import dynamic from 'next/dynamic';
import { FloatingHeader } from '@/components/layout/FloatingHeader';
import { AppFooterLinks } from '@/components/layout/AppFooterLinks';
import { LegalNotice } from '@/components/layout/LegalNotice';
import { ConsentSync } from '@/components/layout/ConsentSync';
import { MapView } from '@/components/map/MapView';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Visit-conditional client widgets — both pay their full bundle
// cost only when they ACTUALLY need to render, not on every mount:
//
//   * OnboardingTour shows once per browser (storage-gated). Even
//     when active, it fires ~1.6 s after mount, so there's plenty
//     of idle time for the chunk to stream in.
//   * PushOnboardingBanner pulls the Push API client + geolocation
//     and only renders when the user is signed in AND hasn't
//     dismissed the banner. Anonymous users were paying for the
//     Web Push SDK upfront for no reason.
const OnboardingTour = dynamic(
  () =>
    import('@/components/onboarding/OnboardingTour').then(
      (m) => m.OnboardingTour,
    ),
  { ssr: false },
);
const PushOnboardingBanner = dynamic(
  () =>
    import('@/components/push/PushOnboardingBanner').then(
      (m) => m.PushOnboardingBanner,
    ),
  { ssr: false },
);
// Install nudge: only loads its chunk client-side and only renders from
// the user's second visit on a touch device, so anonymous / first-time
// / desktop visitors never pay for it.
const InstallPwaBanner = dynamic(
  () =>
    import('@/components/pwa/InstallPwaBanner').then((m) => m.InstallPwaBanner),
  { ssr: false },
);

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
      <InstallPwaBanner />
      <AppFooterLinks />
      <LegalNotice />
      <ConsentSync />
      <OnboardingTour enabled={Boolean(user)} />
    </div>
  );
}
