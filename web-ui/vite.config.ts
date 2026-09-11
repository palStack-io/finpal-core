// `defineConfig` from 'vitest/config', not 'vite': the `test` block below is
// vitest's, and vite's own UserConfigExport has no such key.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    // `e2e/` belongs to Playwright, which brings its own `test` and `expect`.
    // Without this, `npx vitest run` collects those specs and fails to import
    // them — and `preflight.sh` runs vitest, so the whole gate goes red.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    // *** WALL CLOCKS, ADDED 2026-09-10 ON THE OWNER'S INSTRUCTION. ***
    // vitest's defaults are 5s per test and 10s per hook, which are fine — but
    // `testTimeout` does NOT bound the whole run, and the walk captures below
    // drive a real render tree behind MSW. A handler that never answers leaves
    // `findBy*` retrying until the default 1000ms query timeout and then the
    // test times out cleanly; a *hook* that hangs (a `beforeEach` awaiting a
    // request with no handler) had no bound at all worth relying on.
    //
    // Stated explicitly rather than left to the default so the number is visible
    // when a gate starts hanging, which is the moment anybody looks here.
    testTimeout: 15_000,
    hookTimeout: 20_000,
    teardownTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
})
