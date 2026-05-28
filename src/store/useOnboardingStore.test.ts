import { beforeEach, describe, expect, it } from 'vitest';
import { useOnboardingStore } from './useOnboardingStore';

/**
 * The store is intentionally tiny — three actions, one flag. The
 * value of these tests is less about coverage and more about pinning
 * the contract so a future refactor (e.g. moving to user-scoped
 * server storage) can't silently flip the default for everyone.
 */
describe('useOnboardingStore', () => {
  beforeEach(() => {
    useOnboardingStore.setState({ hasSeenTour: false });
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('montana:onboarding');
    }
  });

  it('starts with hasSeenTour = false (so a fresh device runs the tour)', () => {
    expect(useOnboardingStore.getState().hasSeenTour).toBe(false);
  });

  it('markSeen flips the flag to true', () => {
    useOnboardingStore.getState().markSeen();
    expect(useOnboardingStore.getState().hasSeenTour).toBe(true);
  });

  it('reset returns the flag to false (used by the "Restart tour" button)', () => {
    useOnboardingStore.getState().markSeen();
    expect(useOnboardingStore.getState().hasSeenTour).toBe(true);
    useOnboardingStore.getState().reset();
    expect(useOnboardingStore.getState().hasSeenTour).toBe(false);
  });

  it('persists the seen flag to localStorage so it survives a reload', () => {
    useOnboardingStore.getState().markSeen();
    // The zustand `persist` middleware writes synchronously after the
    // state setter. We assert against the raw storage to catch a
    // regression where the key/version is silently renamed and the
    // tour comes back for every returning user.
    const raw = localStorage.getItem('montana:onboarding');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state?.hasSeenTour).toBe(true);
    expect(parsed.version).toBe(1);
  });
});
