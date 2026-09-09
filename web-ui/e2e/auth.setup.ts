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
  await page.goto('/login');

  await page.locator('input[type="email"]').fill(DEMO_USER.email);
  await page.locator('input[type="password"]').fill(DEMO_USER.password);
  // `exact` — the page also has "Sign in with SSO", and a loose /sign in/i
  // matches both. Playwright's strict mode is right to refuse that: a click on
  // "whichever matched first" is a test that asserts nothing reliable.
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 20_000 });
  // Not just the URL: a page can route and still have failed to load. Waiting on
  // real content is what distinguishes "signed in" from "redirected".
  await expect(page.getByRole('link', { name: 'Goals' })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
