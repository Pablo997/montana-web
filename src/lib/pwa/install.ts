/**
 * State + eligibility rules for the "Add to home screen" (PWA install)
 * banner.
 *
 * Mirrors the design of `lib/push/onboarding.ts`: pure, storage-injected
 * functions so the rules are trivially unit-testable and the React hook
 * stays a thin glue layer.
 *
 * Two intentional differences from the push module:
 *   - State is NOT scoped by user id. Installing the app is a
 *     per-device/per-browser action — a second account on the same
 *     phone shouldn't be re-prompted to install something that's
 *     already on the home screen.
 *   - We gate on a VISIT COUNT, not first paint. A fresh visitor has no
 *     reason to install yet; the prompt lands far better on the second
 *     session, once they've seen the app is useful. The session flag
 *     guarantees we count one visit per browser session, not one per
 *     React mount (HMR / client navigations would otherwise inflate it).
 */

const STORAGE_KEY = 'montana:pwa-install:v1';
const VISITS_KEY = 'montana:pwa-install:visits:v1';
/** sessionStorage flag so a visit is counted once per browser session. */
export const VISIT_SESSION_FLAG = 'montana:pwa-install:visit-counted';

/** Snooze window when the user picks "Not now". */
export const INSTALL_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Don't offer the install before the user has opened the app this many
 * times. 2 = "show from the second session onwards".
 */
export const MIN_VISITS = 2;

export type InstallSnapshot =
  | { kind: 'snoozed'; until: number }
  | { kind: 'dismissed_forever' }
  | { kind: 'installed' };

/** Minimal storage surface we rely on, easy to fake in tests. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readSnapshot(storage: StorageLike): InstallSnapshot | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InstallSnapshot | null;
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

function writeSnapshot(storage: StorageLike, snapshot: InstallSnapshot): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* Quota exceeded or storage blocked — degrade silently: worst case
       we re-offer on the next visit, which beats failing a button. */
  }
}

export function snoozeInstall(
  storage: StorageLike,
  now: number = Date.now(),
): void {
  writeSnapshot(storage, { kind: 'snoozed', until: now + INSTALL_SNOOZE_MS });
}

export function dismissInstallForever(storage: StorageLike): void {
  writeSnapshot(storage, { kind: 'dismissed_forever' });
}

export function markInstalled(storage: StorageLike): void {
  writeSnapshot(storage, { kind: 'installed' });
}

/**
 * Increment the persistent visit counter at most once per browser
 * session and return the running total. The `session` store is
 * `sessionStorage` in production (cleared when the tab/app closes) so a
 * page refresh or client-side navigation within the same session does
 * not count as a new visit.
 */
export function recordVisit(
  storage: StorageLike,
  session: StorageLike,
): number {
  let count = 0;
  try {
    count = Number.parseInt(storage.getItem(VISITS_KEY) ?? '0', 10) || 0;
  } catch {
    count = 0;
  }

  let alreadyCounted = false;
  try {
    alreadyCounted = session.getItem(VISIT_SESSION_FLAG) === '1';
  } catch {
    // No sessionStorage (private mode): fall back to counting this
    // mount as a visit. Over-counting slightly is harmless — the
    // worst case is the banner appears one visit earlier.
    alreadyCounted = false;
  }

  if (alreadyCounted) return count;

  count += 1;
  try {
    storage.setItem(VISITS_KEY, String(count));
  } catch {
    /* storage blocked — return the in-memory count */
  }
  try {
    session.setItem(VISIT_SESSION_FLAG, '1');
  } catch {
    /* no session store — visit may be re-counted on refresh */
  }
  return count;
}

export interface InstallEligibilityInput {
  /** Persisted opt-out / snooze / installed marker. */
  snapshot: InstallSnapshot | null;
  /** Running visit total from `recordVisit`. */
  visits: number;
  /** Injected for determinism in tests; production passes `Date.now()`. */
  now: number;
}

/**
 * Decides whether the install banner is allowed to show, based purely
 * on persisted state. Platform concerns (already running standalone,
 * native prompt available vs. iOS manual flow) are evaluated in the
 * hook because they need `window`/`navigator`.
 */
export function isInstallEligible(input: InstallEligibilityInput): boolean {
  if (input.visits < MIN_VISITS) return false;

  const s = input.snapshot;
  if (!s) return true;
  switch (s.kind) {
    case 'installed':
    case 'dismissed_forever':
      return false;
    case 'snoozed':
      return input.now >= s.until;
  }
}
