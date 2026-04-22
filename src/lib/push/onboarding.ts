/**
 * Onboarding state for the Web Push banner.
 *
 * This module is intentionally pure: every side-effecting function
 * takes the `Storage` object as an argument instead of reaching for
 * `window.localStorage` directly. That keeps the logic trivially unit
 * testable in a Node process and stops the UI hook from having to
 * re-implement the same checks.
 *
 * Design notes:
 *   - We store a small discriminated-union snapshot so the rules
 *     ("remind me in 14 days" vs "never ask again" vs "already on")
 *     are encoded in the data, not spread across booleans.
 *   - The storage key is versioned (`v1`) so we can invalidate older
 *     dismissals without risking a stale "accepted" from a previous
 *     product iteration silently swallowing a new prompt.
 *   - Keys are scoped by user id. On a shared computer this stops one
 *     account's dismissal from suppressing the banner for another.
 */

const STORAGE_KEY_PREFIX = 'montana:push-onboarding:v1';

/** Snooze window when the user picks "Not now". */
export const ONBOARDING_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

export type OnboardingSnapshot =
  | { kind: 'snoozed'; until: number }
  | { kind: 'dismissed_forever' }
  | { kind: 'accepted' };

/** Minimal storage surface we rely on, easy to fake in tests. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function storageKeyFor(userId: string | null): string {
  // `anon` exists so unit tests can exercise the read/write path
  // without a user; the hook never actually writes anon keys.
  return `${STORAGE_KEY_PREFIX}:${userId ?? 'anon'}`;
}

export function readSnapshot(
  storage: StorageLike,
  userId: string | null,
): OnboardingSnapshot | null {
  try {
    const raw = storage.getItem(storageKeyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingSnapshot | null;
    if (!parsed || typeof parsed !== 'object' || !('kind' in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    // Malformed JSON or locked-down storage (Safari private mode):
    // treat as "no snapshot" rather than crashing the UI.
    return null;
  }
}

function writeSnapshot(
  storage: StorageLike,
  userId: string | null,
  snapshot: OnboardingSnapshot,
): void {
  try {
    storage.setItem(storageKeyFor(userId), JSON.stringify(snapshot));
  } catch {
    /* Quota exceeded or storage blocked — silently degrade: worst case
       we re-prompt on the next visit, which is strictly better than
       failing the banner's button click. */
  }
}

export function snoozeOnboarding(
  storage: StorageLike,
  userId: string | null,
  now: number = Date.now(),
): void {
  writeSnapshot(storage, userId, {
    kind: 'snoozed',
    until: now + ONBOARDING_SNOOZE_MS,
  });
}

export function dismissOnboardingForever(
  storage: StorageLike,
  userId: string | null,
): void {
  writeSnapshot(storage, userId, { kind: 'dismissed_forever' });
}

export function markOnboardingAccepted(
  storage: StorageLike,
  userId: string | null,
): void {
  writeSnapshot(storage, userId, { kind: 'accepted' });
}

export interface EligibilityInput {
  userId: string | null;
  /** Whether the browser ships `serviceWorker`, `PushManager` and `Notification`. */
  supported: boolean;
  /** Current `Notification.permission`. */
  permission: NotificationPermission;
  /** Whether the browser currently has an active `PushSubscription`. */
  subscribedInBrowser: boolean;
  snapshot: OnboardingSnapshot | null;
  /** Injected for determinism in tests; production callers pass `Date.now()`. */
  now: number;
}

/**
 * Decides whether the onboarding banner should be shown right now.
 *
 * The rules are deliberately restrictive — a mis-fire here is much
 * worse than a missed impression, because a push prompt is a one-shot
 * trust event:
 *   - User must be signed in (the subscription is keyed by `auth.uid()`).
 *   - Browser must support the APIs.
 *   - Permission must still be `default`. Once it's `granted` or
 *     `denied`, a passive banner has no useful action to offer.
 *   - No active browser-side subscription (otherwise we'd be offering
 *     to enable something that's already on).
 *   - The stored snapshot must not mark the user as opted-out or
 *     inside the snooze window.
 */
export function isOnboardingEligible(input: EligibilityInput): boolean {
  if (!input.userId) return false;
  if (!input.supported) return false;
  if (input.permission !== 'default') return false;
  if (input.subscribedInBrowser) return false;

  const s = input.snapshot;
  if (!s) return true;
  switch (s.kind) {
    case 'accepted':
    case 'dismissed_forever':
      return false;
    case 'snoozed':
      return input.now >= s.until;
  }
}
