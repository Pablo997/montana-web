import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * The reporter is mostly glue, but the bucketing is the part with
 * real product impact: if the thresholds drift from web.dev's
 * official numbers, every dashboard cohort silently misrepresents
 * the user experience.
 *
 * We mock `next/web-vitals` to capture the callback Next would
 * normally invoke from the browser. That way we can replay each
 * metric at boundary values and assert the prop shape that hits
 * our `track()` wrapper.
 */
const trackMock = vi.fn();
let capturedCallback:
  | ((metric: { name: string; value: number; navigationType?: string }) => void)
  | null = null;

vi.mock('@/lib/analytics/track', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

vi.mock('next/web-vitals', () => ({
  // Stash the callback Next would normally invoke. We re-fire it
  // ourselves so the test owns timing and doesn't depend on the
  // browser's PerformanceObserver.
  useReportWebVitals: (cb: typeof capturedCallback) => {
    capturedCallback = cb;
  },
}));

describe('WebVitalsReporter', () => {
  beforeEach(() => {
    trackMock.mockReset();
    capturedCallback = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function mount() {
    const { WebVitalsReporter } = await import('./WebVitalsReporter');
    render(<WebVitalsReporter />);
    if (!capturedCallback) throw new Error('hook callback not captured');
    return capturedCallback;
  }

  it('forwards LCP with the right bucket', async () => {
    const report = await mount();
    report({ name: 'LCP', value: 2400, navigationType: 'navigate' });
    expect(trackMock).toHaveBeenCalledWith('web_vital', {
      metric: 'LCP',
      value: 2400,
      rating: 'good',
      navigation_type: 'navigate',
    });
  });

  it('rates LCP at the needs-improvement boundary', async () => {
    const report = await mount();
    report({ name: 'LCP', value: 4000 });
    expect(trackMock.mock.calls[0]?.[1].rating).toBe('needs-improvement');
  });

  it('rates LCP above 4s as poor', async () => {
    const report = await mount();
    report({ name: 'LCP', value: 5000 });
    expect(trackMock.mock.calls[0]?.[1].rating).toBe('poor');
  });

  it('scales CLS by 1000 to keep value as an integer', async () => {
    const report = await mount();
    report({ name: 'CLS', value: 0.137 });
    expect(trackMock.mock.calls[0]?.[1].value).toBe(137);
    expect(trackMock.mock.calls[0]?.[1].rating).toBe('needs-improvement');
  });

  it('rates CLS at 0.1 as good', async () => {
    const report = await mount();
    report({ name: 'CLS', value: 0.1 });
    expect(trackMock.mock.calls[0]?.[1].rating).toBe('good');
  });

  it('handles INP, FCP, TTFB, FID with their own thresholds', async () => {
    const report = await mount();
    report({ name: 'INP', value: 150 });
    report({ name: 'FCP', value: 2200 });
    report({ name: 'TTFB', value: 2000 });
    report({ name: 'FID', value: 250 });
    const ratings = trackMock.mock.calls.map((c) => c[1].rating);
    expect(ratings).toEqual(['good', 'needs-improvement', 'poor', 'needs-improvement']);
  });

  it('defaults navigation_type to "unknown" when missing', async () => {
    const report = await mount();
    report({ name: 'LCP', value: 1000 });
    expect(trackMock.mock.calls[0]?.[1].navigation_type).toBe('unknown');
  });

  it('falls back to "unknown" rating for unrecognised metric names', async () => {
    const report = await mount();
    // Defensive — Next or web-vitals could ship a new metric and
    // we want the reporter to fail open rather than crash.
    report({ name: 'NEW_FUTURE_METRIC', value: 42 });
    expect(trackMock.mock.calls[0]?.[1].rating).toBe('unknown');
  });
});
