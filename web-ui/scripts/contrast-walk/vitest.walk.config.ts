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
    /**
     * *** 20s, BECAUSE THE DEFAULT 5s IS SHORTER THAN THE WAITS INSIDE THE
     * CAPTURES AND THAT MADE EVERY FAILURE ANONYMOUS. ***
     *
     * Both `waitFor`s in the page capture are given 6000ms, and a `drive` runs
     * between them. Under vitest's 5000ms default, a page that never reached its
     * element floor was killed by the TEST timeout before its own waiter could
     * expire — so the report was always "Test timed out in 5000ms" pointing at
     * the `it.each` line, never the "captured a stub / only N elements" message
     * written precisely to say which page and how far short. Three new scopes
     * failed that way on 2026-09-16 and the output named none of them.
     *
     * It also fixes a false failure on a slower machine: the modal capture's
     * `csvimport-complete` passes in 2.8s on this laptop and took over 5s on the
     * Linux host the browser walks run on, so the CAPTURE failed there while the
     * walk happily measured the previous run's files. A gate that fails on
     * machine speed is a gate that gets ignored.
     */
    testTimeout: 20_000,
  },
});
