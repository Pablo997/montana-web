import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_SNOOZE_MS,
  dismissOnboardingForever,
  isOnboardingEligible,
  markOnboardingAccepted,
  readSnapshot,
  snoozeOnboarding,
  storageKeyFor,
  type OnboardingSnapshot,
  type StorageLike,
} from './onboarding';

function createMemoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const USER_ID = 'user-123';
const NOW = 1_700_000_000_000;

const baseInput = {
  userId: USER_ID,
  supported: true,
  permission: 'default' as NotificationPermission,
  subscribedInBrowser: false,
  snapshot: null as OnboardingSnapshot | null,
  now: NOW,
};

describe('storageKeyFor', () => {
  it('scopes the key by user id', () => {
    expect(storageKeyFor('a')).not.toBe(storageKeyFor('b'));
  });

  it('uses an anon bucket when there is no user', () => {
    expect(storageKeyFor(null)).toMatch(/anon$/);
  });
});

describe('isOnboardingEligible', () => {
  it('is false when the user is not signed in', () => {
    expect(isOnboardingEligible({ ...baseInput, userId: null })).toBe(false);
  });

  it('is false when the browser does not support push', () => {
    expect(isOnboardingEligible({ ...baseInput, supported: false })).toBe(false);
  });

  it('is false when permission was already granted', () => {
    expect(isOnboardingEligible({ ...baseInput, permission: 'granted' })).toBe(false);
  });

  it('is false when permission was denied', () => {
    expect(isOnboardingEligible({ ...baseInput, permission: 'denied' })).toBe(false);
  });

  it('is false when a subscription already exists in the browser', () => {
    expect(
      isOnboardingEligible({ ...baseInput, subscribedInBrowser: true }),
    ).toBe(false);
  });

  it('is true when nothing has ever been stored', () => {
    expect(isOnboardingEligible(baseInput)).toBe(true);
  });

  it('is false when the user accepted previously', () => {
    expect(
      isOnboardingEligible({
        ...baseInput,
        snapshot: { kind: 'accepted' },
      }),
    ).toBe(false);
  });

  it('is false when the user dismissed forever', () => {
    expect(
      isOnboardingEligible({
        ...baseInput,
        snapshot: { kind: 'dismissed_forever' },
      }),
    ).toBe(false);
  });

  it('is false inside the snooze window', () => {
    expect(
      isOnboardingEligible({
        ...baseInput,
        snapshot: { kind: 'snoozed', until: NOW + 1000 },
      }),
    ).toBe(false);
  });

  it('is true once the snooze window has elapsed', () => {
    expect(
      isOnboardingEligible({
        ...baseInput,
        snapshot: { kind: 'snoozed', until: NOW - 1 },
      }),
    ).toBe(true);
  });
});

describe('storage round-trip', () => {
  it('persists a snooze with the expected expiry', () => {
    const storage = createMemoryStorage();
    snoozeOnboarding(storage, USER_ID, NOW);
    expect(readSnapshot(storage, USER_ID)).toEqual({
      kind: 'snoozed',
      until: NOW + ONBOARDING_SNOOZE_MS,
    });
  });

  it('persists a permanent dismissal', () => {
    const storage = createMemoryStorage();
    dismissOnboardingForever(storage, USER_ID);
    expect(readSnapshot(storage, USER_ID)).toEqual({
      kind: 'dismissed_forever',
    });
  });

  it('persists acceptance', () => {
    const storage = createMemoryStorage();
    markOnboardingAccepted(storage, USER_ID);
    expect(readSnapshot(storage, USER_ID)).toEqual({ kind: 'accepted' });
  });

  it('returns null for unknown users', () => {
    const storage = createMemoryStorage();
    markOnboardingAccepted(storage, USER_ID);
    expect(readSnapshot(storage, 'someone-else')).toBeNull();
  });

  it('treats malformed JSON as no snapshot', () => {
    const storage = createMemoryStorage();
    storage.setItem(storageKeyFor(USER_ID), '{ not json');
    expect(readSnapshot(storage, USER_ID)).toBeNull();
  });

  it('treats payloads without a `kind` field as no snapshot', () => {
    const storage = createMemoryStorage();
    storage.setItem(storageKeyFor(USER_ID), '{"foo":true}');
    expect(readSnapshot(storage, USER_ID)).toBeNull();
  });

  it('silently degrades when storage throws on write', () => {
    const brokenStorage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: () => undefined,
    };
    expect(() => snoozeOnboarding(brokenStorage, USER_ID, NOW)).not.toThrow();
  });
});
