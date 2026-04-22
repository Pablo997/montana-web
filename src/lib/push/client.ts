'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Browser-side Web Push plumbing.
 *
 * The goals of this module:
 *   - Never import anything server-only (keeps the client bundle small).
 *   - Expose a single `subscribe({ center, radiusKm, minSeverity })` that
 *     handles permission, the PushManager dance, VAPID conversion and
 *     the round-trip to our RPC. Callers just deal with preferences.
 *   - Be defensive about Safari/iOS quirks: permission can be `default`,
 *     `granted`, or `denied`, and each requires a different user story.
 *
 * The actual `push` event listener lives in `public/sw.js`; this module
 * only manages the *subscription* lifecycle, not delivery.
 */

export type MinSeverity = 'mild' | 'moderate' | 'severe';

export interface PushPreferences {
  center: { lat: number; lng: number };
  radiusKm: number;
  minSeverity: MinSeverity;
  enabled: boolean;
}

export interface PushStatus {
  /** The browser ships the APIs we need. */
  supported: boolean;
  /** Current Notification.permission. */
  permission: NotificationPermission;
  /** A PushSubscription is currently active in the browser. */
  subscribedInBrowser: boolean;
}

/** Returns a snapshot of the browser's support + permission state. */
export function getPushStatus(): PushStatus {
  if (typeof window === 'undefined') {
    return { supported: false, permission: 'default', subscribedInBrowser: false };
  }
  const supported =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  return {
    supported,
    permission: supported ? Notification.permission : 'default',
    subscribedInBrowser: false, // filled in by `refreshSubscriptionStatus()` below
  };
}

/**
 * Checks whether the browser currently has a PushSubscription. Call
 * this after the SW is registered; before that, `getRegistration()`
 * resolves to `undefined` and we'd get a false negative.
 */
export async function refreshSubscriptionStatus(): Promise<PushStatus> {
  const base = getPushStatus();
  if (!base.supported) return base;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return { ...base, subscribedInBrowser: Boolean(sub) };
  } catch {
    return base;
  }
}

/**
 * Subscribes (or updates an existing subscription with new prefs).
 * Idempotent: calling this repeatedly with the same prefs is a no-op
 * on the DB side thanks to the ON CONFLICT clause in the RPC.
 *
 * Throws on:
 *   - Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY (config error).
 *   - `Notification.permission === 'denied'` (UI must show recovery
 *     instructions; we can't reprompt).
 *   - SW not registered (shouldn't happen in production, but during
 *     dev the SW is intentionally off; this surfaces the mismatch).
 */
export async function subscribe(prefs: PushPreferences): Promise<void> {
  if (!getPushStatus().supported) {
    throw new Error('Push notifications are not supported in this browser.');
  }
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error('Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY env var.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked. Enable them in your browser settings and try again.'
        : 'Notifications were not granted.',
    );
  }

  // `serviceWorker.ready` hangs forever if no SW is ever registered
  // (which is the case in dev: RegisterServiceWorker intentionally
  // unregisters in non-production to avoid fighting Next's HMR). Race
  // it against a timeout so the UI never gets stuck in "Saving…".
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              'Service worker is not active. Push notifications only work on a production build. Run `npm run build && npm run start` to test locally, or deploy to Vercel.',
            ),
          ),
        4000,
      ),
    ),
  ]);
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast via BufferSource: the PushManager typings in TS >=5.7 want
      // ArrayBufferView<ArrayBuffer> specifically, and `Uint8Array` is
      // now generic over the backing buffer. The runtime contract is
      // identical; we just widen the type to satisfy the overload.
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('PushSubscription is missing crypto material.');
  }

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.rpc('upsert_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_lat: prefs.center.lat,
    p_lng: prefs.center.lng,
    p_radius_km: prefs.radiusKm,
    p_min_severity: prefs.minSeverity,
    p_enabled: prefs.enabled,
  });

  if (error) throw new Error(error.message);
}

/**
 * Revokes the push subscription locally AND remotely. We tear down the
 * browser-side PushSubscription first so the push service stops
 * delivering immediately; if the RPC call fails we still end up in a
 * consistent "not subscribed" state from the user's POV.
 */
export async function unsubscribe(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await sub.unsubscribe().catch(() => {});
  }
  const supabase = createSupabaseBrowserClient();
  await supabase.rpc('delete_my_push_subscriptions');
}

/** Loads the current user's saved preferences, or null if none. */
export async function loadPreferences(): Promise<PushPreferences | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_my_push_preferences');
  if (error || !data || data.length === 0) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    center: { lat: row.lat, lng: row.lng },
    radiusKm: row.radius_km,
    minSeverity: row.min_severity as MinSeverity,
    enabled: row.enabled,
  };
}

/**
 * VAPID keys arrive as URL-safe base64. The PushManager API wants a
 * Uint8Array of the raw bytes, so we convert. Copied from the MDN
 * reference implementation; unchanged for compatibility.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}
