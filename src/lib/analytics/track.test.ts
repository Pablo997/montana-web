import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `track()` is intentionally minimal but it's also the entry point
 * every product event flows through, so we pin its contract:
 *
 *   * Calls `@vercel/analytics`'s `track` ONLY in production.
 *   * Console-logs in dev when `NEXT_PUBLIC_ANALYTICS_DEBUG=1`.
 *   * Never throws if the SDK explodes.
 *
 * Mocking the Vercel SDK lets us assert call counts without
 * actually hitting their endpoint.
 */
const trackMock = vi.fn();

vi.mock('@vercel/analytics', () => ({
  // The SDK exposes `track` as a named export; tests grab the mock
  // through this re-export to verify producer behaviour.
  track: (...args: unknown[]) => trackMock(...args),
}));

describe('analytics/track', () => {
  beforeEach(() => {
    trackMock.mockReset();
    // `vi.stubEnv` is the supported way to mutate `process.env`
    // entries that TypeScript marks readonly (NODE_ENV). It also
    // auto-unstubs after each test when paired with the matching
    // afterEach below, so we never leak env between specs.
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('forwards events to vercel/analytics in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { track } = await import('./track');
    track('tour_started', { total_steps: 7 });
    expect(trackMock).toHaveBeenCalledExactlyOnceWith('tour_started', {
      total_steps: 7,
    });
  });

  it('does NOT forward events in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_ANALYTICS_DEBUG', '');
    vi.resetModules();
    const { track } = await import('./track');
    track('tour_completed');
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('logs to console.debug in development when ANALYTICS_DEBUG=1', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_ANALYTICS_DEBUG', '1');
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.resetModules();
    const { track } = await import('./track');
    track('search_used', { source: 'result' });
    expect(debugSpy).toHaveBeenCalledExactlyOnceWith('[analytics]', 'search_used', {
      source: 'result',
    });
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('swallows errors from the underlying SDK so user flows never break', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    trackMock.mockImplementationOnce(() => {
      throw new Error('network down');
    });
    vi.resetModules();
    const { track } = await import('./track');
    // No throw + no unhandled rejection: the act of calling is the
    // assertion. We re-check that the mock fired so we know we
    // actually exercised the catch path.
    expect(() => track('incident_voted', { direction: 'up' })).not.toThrow();
    expect(trackMock).toHaveBeenCalled();
  });
});
