import { test as setup, expect } from '@playwright/test';
import { DEMO_USER, STORAGE_STATE } from './fixtures';

/**
 * Sign in once, through the real form, and save what the app itself stored.
 *
 * *** THIS REPLACED A HAND-BUILT localStorage OBJECT, AND THE E2E SUITE IS WHAT
 * PROVED THAT WRONG. *** The first version POSTed to `/auth/login` and wrote an
 * `auth-storage` blob assembled by hand from the response. It got the user past
 * the route guard and looked like it worked — and every data-loading page then
 * rendered `Network Error` with the demo banner reading `Time remaining: 0:00`,
 * because the invented state was missing what the app actually needs for a demo
 * session.
 *
 * That is this project's oldest mistake in a new place: an interface is a claim
 * about a server, not a check of one (D-69, D-101, and three more). A hand-built
 * auth state is a claim about a CLIENT, and it was wrong in exactly the way that
 * still let four specs pass.
 *
 * So: drive the form, let the app write its own state, and save that. The state
 * cannot drift from what the app expects, because the app is what produced it.
 */
setup('authenticate as the demo user', async ({ page }) => {
  /* Same race as `auth.spec.ts`: the page paints the credential form until
     `/demo/status` lands and then swaps to the personas, so the persona button
     this setup clicks does not exist yet at `goto` time. Playwright's locator
     would auto-wait for it anyway — the explicit wait is here so a FAILURE
     points at the fetch rather than at a missing button, which is the
     difference between a one-minute diagnosis and an afternoon. */
  const demoStatus = page.waitForResponse((r) => r.url().includes('/api/v1/demo/status'));
  await page.goto('/login');
  await demoStatus;

  /*
   * *** THE SETUP CLICKS A PERSONA NOW, BECAUSE THAT IS WHAT A DEMO VISITOR
   * DOES. *** Owner decision 2026-09-16: with `DEMO_MODE` on, the login page
   * leads with the four demo personas and the credential form moves behind a
   * disclosure. `scripts/e2e/run.sh` sets `DEMO_MODE=true` — that flag is what
   * runs the seeder this whole suite reads — so this setup was about to be
   * driving a form that is no longer the first thing on the page.
   *
   * Clicking the persona is the better path anyway, and not only because it
   * still works: this file is the setup for every other spec, so what it drives
   * should be the way people actually get in. `auth.spec.ts` keeps driving the
   * FORM, through the disclosure, so the two ways in are covered separately
   * rather than one of them twice.
   *
   * Keyed to the persona's NAME rather than its email: the button renders
   * `{account.name}` and a name is what a human clicks. If the seed ever renames
   * Alex Demo, this fails loudly here instead of every spec failing vaguely.
   */
  await page.getByRole('button', { name: new RegExp(DEMO_USER.name) }).click();

  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 20_000 });
  // Not just the URL: a page can route and still have failed to load. Waiting on
  // real content is what distinguishes "signed in" from "redirected".
  await expect(page.getByRole('link', { name: 'Goals' })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
