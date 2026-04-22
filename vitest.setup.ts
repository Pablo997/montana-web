import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Global test setup.
 *
 * Testing Library doesn't auto-cleanup when `globals: true` is set in
 * Vitest (it only hooks into `afterEach` when it detects Jest's
 * globals), so we wire it up manually. Without this, DOM nodes from
 * one test leak into the next and assertions start hitting stale
 * nodes — a classic flaky-test trap.
 */
afterEach(() => {
  cleanup();
});
