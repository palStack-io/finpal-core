/**
 * A separate config so the capture is invisible to `npx vitest run`.
 *
 * The capture writes a file as a side effect and is a verification tool rather
 * than a gate, so it must not join the suite CI runs. vitest 3 has no `--include`
 * flag, and a positional argument only filters files the configured glob already
 * matched — so pointing `include` at this one file is the way to ask for it.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    root: new URL('../..', import.meta.url).pathname,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: [process.env.WALK_CAPTURE ?? 'scripts/contrast-walk/capture.walk.tsx'],
  },
});
