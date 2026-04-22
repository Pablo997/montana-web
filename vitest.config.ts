import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vitest config tuned for a Next.js 14 App Router codebase.
 *
 * - `jsdom` so we can render React components that touch the DOM
 *   (the alternative, happy-dom, is faster but lacks a few APIs we
 *   need like `navigator.onLine` events firing correctly).
 * - `globals: true` lets us use `describe`/`it`/`expect` without
 *   importing, matching the Jest ergonomics most guides expect.
 * - Playwright's own tests live under `tests/e2e` and use a
 *   different runner, so they're excluded from Vitest discovery.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'tests/e2e/**'],
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
