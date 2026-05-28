import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * One-time onboarding tour state.
 *
 * The tour is purely guidance — it shows once per browser and then
 * stays out of the way unless the user explicitly resets it from
 * `/me → Restart tour`. We persist by browser (not by Supabase user)
 * because the storage cost of "did this person already see the
 * tour?" doesn't justify a round-trip to the DB on every map mount,
 * and the per-device behaviour is what users actually expect — a
 * fresh device is a fresh introduction.
 *
 * `version` is bumped manually if we ever rewrite the tour to a new
 * set of steps and want everyone to see it again.
 */
interface OnboardingState {
  hasSeenTour: boolean;
  markSeen: () => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasSeenTour: false,
      markSeen: () => set({ hasSeenTour: true }),
      reset: () => set({ hasSeenTour: false }),
    }),
    {
      name: 'montana:onboarding',
      version: 1,
      storage: createJSONStorage(() =>
        typeof window === 'undefined'
          ? (undefined as unknown as Storage)
          : window.localStorage,
      ),
      partialize: (state) => ({ hasSeenTour: state.hasSeenTour }),
    },
  ),
);
