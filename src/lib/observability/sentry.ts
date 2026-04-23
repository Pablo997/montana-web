// Observability helpers built on top of @sentry/nextjs.
//
// Goal: give the rest of the codebase one place to reach for when it
// needs to (a) report an error that the default SDK instrumentation
// wouldn't capture, or (b) tag events with the current user. Keeping
// it thin avoids the usual observability-library trap where the
// abstraction is so clever nobody understands why a stack trace looks
// wrong.
//
// Design constraints:
//   * Every function MUST be safe to call from both server and client.
//     Sentry.init is a no-op when DSN is missing, so calling
//     Sentry.* without a guard here just produces no-ops in the same
//     environments the SDK itself would skip.
//   * Every function MUST be safe to call with unknown input. Our
//     error handling frequently passes `catch (err)` where `err: unknown`
//     — we coerce at the boundary so callers don't have to.
//   * No function throws. If observability code itself crashes we
//     swallow the error and log to console so we don't mask the
//     original failure.

import * as Sentry from '@sentry/nextjs';

/** Narrow an unknown caught value to an Error instance. */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error('Unknown error');
  }
}

export interface CaptureContext {
  /** Logical bucket, e.g. "admin.dismissReport" or "api.me.delete". */
  tag?: string;
  /** Freeform extras the SDK surfaces under `Additional Data`. */
  extras?: Record<string, unknown>;
  /** Override the default `error` level. */
  level?: Sentry.SeverityLevel;
}

/**
 * Ship an error to Sentry without re-throwing. Use it in server code
 * where you've already decided to return a graceful failure to the
 * client but still want the incident visible in the Issues feed.
 *
 * Returns the Sentry event id (or null) so callers can surface a
 * support reference to the user if they want.
 */
export function captureServerError(
  value: unknown,
  context: CaptureContext = {},
): string | null {
  try {
    const err = toError(value);
    return Sentry.captureException(err, (scope) => {
      if (context.tag) scope.setTag('op', context.tag);
      if (context.level) scope.setLevel(context.level);
      if (context.extras) {
        for (const [k, v] of Object.entries(context.extras)) {
          scope.setExtra(k, v);
        }
      }
      return scope;
    });
  } catch (sdkErr) {
    // Observability code must never mask the real bug.
    // eslint-disable-next-line no-console
    console.error('[sentry] captureServerError failed', sdkErr);
    return null;
  }
}

/**
 * Attach an anonymised user id to subsequent events on the current
 * scope. We deliberately avoid email / username — Sentry's ingest
 * treats anything under `user.*` as PII and a tightly scoped uuid is
 * the minimum viable identifier for "same user / different session"
 * dedup.
 *
 * Safe to call repeatedly; overwrites the previous value.
 */
export function setSentryUser(userId: string | null | undefined): void {
  try {
    if (!userId) {
      Sentry.setUser(null);
      return;
    }
    Sentry.setUser({ id: userId });
  } catch (sdkErr) {
    // eslint-disable-next-line no-console
    console.error('[sentry] setSentryUser failed', sdkErr);
  }
}

/** Convenience — explicit opposite of setSentryUser for logout flows. */
export function clearSentryUser(): void {
  setSentryUser(null);
}
