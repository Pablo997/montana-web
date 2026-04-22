import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OfflineIndicator } from './OfflineIndicator';

/**
 * Tests the transition logic that shipped the "pill stuck visible
 * after reconnect" regression earlier: we must trust the browser's
 * `online`/`offline` events for instant UI changes, and only use the
 * probe as a safety net for the initial render and the 20s interval.
 */

const PILL_TEXT = /Offline — showing cached map only/;

function setOnlineFlag(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

describe('<OfflineIndicator />', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setOnlineFlag(true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders nothing when the browser reports online', async () => {
    render(<OfflineIndicator />);
    // Let the mount-time probe resolve (synchronous microtasks).
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(PILL_TEXT)).not.toBeInTheDocument();
  });

  it('appears instantly when the browser fires "offline"', async () => {
    render(<OfflineIndicator />);
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByText(PILL_TEXT)).toBeInTheDocument();
  });

  it('disappears instantly when the browser fires "online" (no probe race)', async () => {
    // Start offline so the pill is visible.
    setOnlineFlag(false);
    render(<OfflineIndicator />);

    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(PILL_TEXT)).toBeInTheDocument();

    // Critical: even if fetch were currently failing, coming back
    // "online" must hide the pill immediately — no probe is fired on
    // this transition by design.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('still recovering')));

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText(PILL_TEXT)).not.toBeInTheDocument();
  });

  it('shows the pill if the initial probe fails despite navigator.onLine=true', async () => {
    // This is the F5-in-DevTools-offline-mode scenario.
    setOnlineFlag(true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    render(<OfflineIndicator />);

    await act(async () => {
      // Flush the probe promise chain.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(PILL_TEXT)).toBeInTheDocument();
  });

  it('self-heals on the 20s interval when state was wrong', async () => {
    // Start offline-ish: navigator says online, probe fails → pill shows.
    setOnlineFlag(true);
    const failingFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', failingFetch);

    render(<OfflineIndicator />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(PILL_TEXT)).toBeInTheDocument();

    // Now network recovers but the `online` event was lost somehow
    // (e.g. suspended tab missed it). The interval must catch it.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      // Flush the probe's microtasks.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText(PILL_TEXT)).not.toBeInTheDocument();
  });
});
