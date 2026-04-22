'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getPushStatus, refreshSubscriptionStatus } from '@/lib/push/client';
import {
  dismissOnboardingForever,
  isOnboardingEligible,
  markOnboardingAccepted,
  readSnapshot,
  snoozeOnboarding,
} from '@/lib/push/onboarding';

/**
 * How long to wait after mount before the banner is allowed to appear.
 * A first-visit impression 0 ms after the map paints feels pushy; a
 * short delay lets the user orient themselves so the prompt lands as a
 * helpful nudge instead of a modal in disguise.
 */
const REVEAL_DELAY_MS = 6000;

export interface PushOnboardingController {
  /** The banner should be rendered right now. */
  visible: boolean;
  /** "Not now" — snooze for two weeks. */
  snooze: () => void;
  /** "Don't ask again" — permanently dismiss. */
  dismissForever: () => void;
  /** Call after `subscribe()` resolves so we never re-prompt. */
  markAccepted: () => void;
}

/**
 * Glue between the pure eligibility rules in `lib/push/onboarding.ts`
 * and a React component. Keeps every `localStorage` / `navigator`
 * touch inside a single effect and exposes a boring state-plus-handlers
 * shape so the banner component can stay dumb.
 *
 * Intentional no-ops:
 *   - In development the service worker is unregistered by
 *     `RegisterServiceWorker` to keep Next HMR happy; without a SW the
 *     `subscribe()` call would time out, so nagging the developer with
 *     a banner that can't succeed is pointless. We hide unconditionally.
 *   - During the auth bootstrap (`loading`) we don't touch storage —
 *     we want a single deterministic evaluation once we know the user.
 */
export function usePushOnboarding(): PushOnboardingController {
  const { userId, loading } = useCurrentUser();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setVisible(false);
      return;
    }
    if (process.env.NODE_ENV !== 'production') {
      setVisible(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const base = getPushStatus();
      // Resolve the live subscription state *after* the SW has had a
      // chance to register; otherwise `getRegistration()` returns
      // undefined and we'd treat every user as "not subscribed" even
      // when they already are.
      const status = await refreshSubscriptionStatus();
      if (cancelled) return;

      const snapshot = readSnapshot(window.localStorage, userId);
      setVisible(
        isOnboardingEligible({
          userId,
          supported: base.supported,
          permission: status.permission,
          subscribedInBrowser: status.subscribedInBrowser,
          snapshot,
          now: Date.now(),
        }),
      );
    }, REVEAL_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userId, loading]);

  const snooze = useCallback(() => {
    if (userId) snoozeOnboarding(window.localStorage, userId);
    setVisible(false);
  }, [userId]);

  const dismissForever = useCallback(() => {
    if (userId) dismissOnboardingForever(window.localStorage, userId);
    setVisible(false);
  }, [userId]);

  const markAccepted = useCallback(() => {
    if (userId) markOnboardingAccepted(window.localStorage, userId);
    setVisible(false);
  }, [userId]);

  return { visible, snooze, dismissForever, markAccepted };
}
