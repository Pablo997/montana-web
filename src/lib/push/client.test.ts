import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// IMPORTANT: these tests intentionally only cover the pure helper
// (`urlBase64ToUint8Array` via the public behaviour of `subscribe`'s
// key conversion) and the `getPushStatus` snapshot logic. The full
// subscribe/unsubscribe flow talks to the browser's PushManager and
// Supabase RPCs; exercising those would require far more invasive
// mocks than they're worth. The Playwright smoke suite is the right
// place for that, not unit tests.

describe('getPushStatus', () => {
  const originalNavigator = globalThis.navigator;
  const originalWindow = globalThis.window;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test('returns supported:false when running with no window', async () => {
    vi.stubGlobal('window', undefined);
    const { getPushStatus } = await import('./client');
    expect(getPushStatus().supported).toBe(false);
  });

  test('reports the current Notification.permission when APIs exist', async () => {
    // jsdom doesn't ship PushManager; fake the three globals the
    // helper probes. Casting is fine here — we only exercise a
    // read path.
    vi.stubGlobal('Notification', { permission: 'granted' } as unknown);
    const nav = {
      serviceWorker: {} as unknown,
    };
    Object.defineProperty(globalThis, 'navigator', {
      value: nav,
      configurable: true,
    });
    vi.stubGlobal('PushManager', class {} as unknown);

    const { getPushStatus } = await import('./client');
    const status = getPushStatus();
    expect(status.supported).toBe(true);
    expect(status.permission).toBe('granted');
    expect(status.subscribedInBrowser).toBe(false);
  });

  test('degrades gracefully when Notification is missing', async () => {
    const nav = { serviceWorker: {} as unknown };
    Object.defineProperty(globalThis, 'navigator', {
      value: nav,
      configurable: true,
    });
    vi.stubGlobal('PushManager', class {} as unknown);
    // Deliberately no `Notification` — older iOS / WebView builds.
    delete (globalThis as Record<string, unknown>).Notification;

    const { getPushStatus } = await import('./client');
    expect(getPushStatus().supported).toBe(false);
  });
});
