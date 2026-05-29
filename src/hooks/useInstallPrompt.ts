'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics/track';
import {
  dismissInstallForever,
  isInstallEligible,
  markInstalled,
  readSnapshot,
  recordVisit,
  snoozeInstall,
} from '@/lib/pwa/install';

/**
 * The `beforeinstallprompt` event isn't in the DOM lib typings yet
 * (it's a Chromium extension to the spec). Declaring the slice we use
 * keeps the call sites type-safe without an `any`.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export type InstallMode = 'native' | 'ios';

export interface InstallPromptController {
  /** The banner should render now. */
  visible: boolean;
  /** Which flow to render: Chromium native prompt or iOS manual steps. */
  mode: InstallMode;
  /** Trigger the native prompt (no-op in `ios` mode). */
  promptInstall: () => Promise<void>;
  /** "Not now" — snooze for two weeks. */
  snooze: () => void;
  /** "Don't ask again" — permanent opt-out. */
  dismissForever: () => void;
}

/**
 * After how long the banner is allowed to surface. A prompt 0 ms after
 * the map paints feels like a pop-up; a short beat lets the user orient
 * before we ask them to install.
 */
const REVEAL_DELAY_MS = 4000;

/**
 * Owns the "Add to home screen" lifecycle:
 *   - captures (and suppresses) Chromium's `beforeinstallprompt` so we
 *     control timing and copy instead of the browser's mini-infobar;
 *   - detects iOS Safari, which has no programmatic prompt, and offers
 *     manual instructions instead;
 *   - gates everything behind a visit count + persisted opt-out so we
 *     never nag, and behind the standalone check so we never offer to
 *     install an app that's already installed.
 *
 * Mirrors `usePushOnboarding`: all storage / navigator access lives in
 * one effect and the component stays a dumb renderer.
 */
export function useInstallPrompt(): InstallPromptController {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<InstallMode>('native');
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const offeredRef = useRef(false);

  useEffect(() => {
    // In dev the service worker is unregistered (HMR), so the install
    // criteria never fire and nagging the developer is pointless.
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined') return;

    const nav = window.navigator as Navigator & { standalone?: boolean };

    // Already launched from the home screen → nothing to offer.
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      nav.standalone === true;
    if (standalone) return;

    // Scope: phones/tablets only (coarse pointer). Drop this check to
    // also offer desktop installs.
    const isMobile = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    if (!isMobile) return;

    const storage = window.localStorage;
    const visits = recordVisit(storage, window.sessionStorage);

    const reveal = (resolved: InstallMode) => {
      const eligible = isInstallEligible({
        snapshot: readSnapshot(storage),
        visits,
        now: Date.now(),
      });
      if (!eligible) return;
      setMode(resolved);
      setVisible(true);
    };

    const ua = nav.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    // Only Safari can add to the home screen on iOS; Chrome/Firefox/Edge
    // for iOS are WebKit shells without the affordance, so suppressing
    // the banner for them avoids dead-end instructions.
    const isIosSafari = isIos && !/crios|fxios|edgios/i.test(ua);

    let timer = 0;

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => reveal('native'), REVEAL_DELAY_MS);
    };

    const onAppInstalled = () => {
      markInstalled(storage);
      track('pwa_installed', { mode: 'native' });
      setVisible(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    if (isIosSafari) {
      timer = window.setTimeout(() => reveal('ios'), REVEAL_DELAY_MS);
    }

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  // One `pwa_install_offered` per appearance, no matter how the banner
  // re-renders.
  useEffect(() => {
    if (visible && !offeredRef.current) {
      offeredRef.current = true;
      track('pwa_install_offered', { mode });
    }
  }, [visible, mode]);

  const promptInstall = useCallback(async () => {
    const deferred = deferredRef.current;
    if (!deferred) {
      setVisible(false);
      return;
    }
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') {
        markInstalled(window.localStorage);
        track('pwa_installed', { mode: 'native' });
      } else {
        snoozeInstall(window.localStorage);
        track('pwa_install_dismissed', { forever: false });
      }
    } catch {
      // `prompt()` throws if invoked twice or disallowed — just hide.
    } finally {
      // The event is single-use; Chrome won't let us prompt() again.
      deferredRef.current = null;
      setVisible(false);
    }
  }, []);

  const snooze = useCallback(() => {
    snoozeInstall(window.localStorage);
    track('pwa_install_dismissed', { forever: false });
    setVisible(false);
  }, []);

  const dismissForever = useCallback(() => {
    dismissInstallForever(window.localStorage);
    track('pwa_install_dismissed', { forever: true });
    setVisible(false);
  }, []);

  return { visible, mode, promptInstall, snooze, dismissForever };
}
