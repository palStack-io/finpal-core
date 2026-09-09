import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE } from './e2e/fixtures';

/**
 * End-to-end config.
 *
 * *** THIS IS THE FIRST THING IN THIS PROJECT THAT DRIVES A REAL BROWSER AGAINST
 * A RUNNING SERVER. *** The three existing walks (`contrast-walk`,
 * `responsive-walk`, `modal-walk`) render components into **jsdom** and measure
 * the captures in headless Chrome. That is why they can measure a colour and
 * cannot click through a login, cannot see a route guard, and cannot tell you
 * that a page 500s when a real API answers it.
 *
 * It is NOT wired into `preflight.sh` on purpose. Preflight runs before every
 * push and already takes ~15 minutes; this needs browser binaries and a booted
 * stack, and making the pre-push gate slower is how a gate starts getting
 * skipped. Run it with `scripts/e2e/run.sh`, which boots and tears down
 * everything it needs.
 *
 * `webServer` is deliberately absent: the stack is two processes (Flask on 5001,
 * Vite on 5173) with a seeding step between them, and expressing that here would
 * split the boot logic across two files. The script owns it.
 */
export default defineConfig({
  testDir: './e2e',
  // One worker. The suite drives ONE seeded demo database, so parallel specs
  // would race each other's writes — a goal created by one spec changing the
  // count another asserts. Correctness over speed at this size.
  workers: 1,
  fullyParallel: false,
  // No retries. A retry turns a real flake into a green run and hides exactly
  // the class of defect an E2E suite exists to find.
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // `list` because the point of this suite is one command and a few lines of
  // output. An HTML report nobody opens is not worth the write.
  // `list` for a human; `json` alongside it when PLAYWRIGHT_JSON_OUTPUT_NAME is
  // set, so a failure can be triaged from a few lines instead of a full log.
  reporter: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME
    ? [['list'], ['json']]
    : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    // Only on failure: a trace per run is ~1MB and this is not a CI artifact
    // store. On failure it is the difference between a diagnosis and a rerun.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    // Signs in through the real form once and saves what the APP stored, rather
    // than a hand-built blob. The first version invented the auth state, got
    // past the route guard, and left every data page rendering `Network Error`.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testIgnore: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
    },
    {
      // The auth specs test being signed OUT and signing in, so they must not
      // inherit a session. Its own project rather than a `test.use` inside the
      // file, so the isolation is visible here rather than one import away.
      name: 'chromium-signed-out',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
    },
  ],
});
