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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
})
