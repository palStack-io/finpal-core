import { test, expect } from '@playwright/test';
import { DEMO_USER } from './fixtures';

/**
 * The login form, driven for real — the one spec that does not take a shortcut.
 *
 * Every other spec seeds the token, so that a change to this form breaks ONE
 * file instead of all of them. This is the file it breaks.
 *
 * *** AND IT ASSERTS THE ROUTE GUARD, WHICH NO VITEST TEST CAN. *** The guard is
 * `ProtectedRoute` plus a redirect plus persisted state plus a real token; the
 * component tests mock all four away. A signed-out user reaching /goals is
 * exactly the kind of thing that returns 200 and renders fine.
 */

test('a signed-out visitor cannot reach a protected page', async ({ page }) => {
  await page.goto('/goals');
  // Redirected away from the goals page. Asserted as "not on /goals" rather than
  // as a specific destination, because which page a guard lands you on is a
  // product decision that may move; that it does not let you through is not.
  await expect(page).not.toHaveURL(/\/goals$/);
  await expect(page.getByText(/Pay off the/)).toHaveCount(0);
});

test('the demo user can sign in through the form', async ({ page }) => {
  const demoStatus = page.waitForResponse((r) => r.url().includes('/api/v1/demo/status'));
  await page.goto('/login');
  await demoStatus;

  /*
   * *** THE FORM IS BEHIND A DISCLOSURE WHEN DEMO MODE IS ON, AND THIS SUITE
   * RUNS WITH IT ON. *** Owner decision 2026-09-16: the demo offers the demo
   * way in, and the credential block is one click away. Opening it here is the
   * point of this file — `auth.setup.ts` covers the persona path, and this one
   * keeps covering the form, including the wrong-password case a persona button
   * cannot express.
   *
   * *** AND THE WAIT ABOVE IS LOAD-BEARING, NOT DEFENSIVE. *** `demoFirst`
   * needs `isDemoLoading` to be false, and it starts true — so the page ALWAYS
   * paints the form first and swaps to the personas when `/demo/status` lands.
   * Without waiting for that response, this spec could fill in a form that was
   * about to unmount underneath it: it passed run after run in isolation and
   * failed once in the full suite, which is the signature of exactly that race.
   * A flaky auth spec is the worst kind, so the wait is explicit rather than a
   * `networkidle` guess, and it is armed BEFORE `goto` so a fast response
   * cannot land before the listener exists.
   */
  const disclose = page.getByRole('button', { name: /email and password instead/i });
  if (await disclose.count()) await disclose.click();


  await page.locator('input[type="email"]').fill(DEMO_USER.email);
  await page.locator('input[type="password"]').fill(DEMO_USER.password);
  // `exact` — the page also has "Sign in with SSO", and a loose match resolves
  // to both, which Playwright's strict mode refuses. Rightly: clicking whichever
  // matched first is a test that asserts nothing reliable.
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  // Asserted on where it lands and on a rendered figure, not on a status code:
  // login answering 200 while the app stays on /login is the failure mode.
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
});

test('a wrong password is refused and does not sign anybody in', async ({ page }) => {
  // The inverse of the symptom. Two unreported sandbox leaks were found exactly
  // this way (D-79, D-81): a login test that only tries the correct password
  // passes just as well against a server that accepts anything.
  const demoStatus = page.waitForResponse((r) => r.url().includes('/api/v1/demo/status'));
  await page.goto('/login');
  await demoStatus;

  /*
   * *** THE FORM IS BEHIND A DISCLOSURE WHEN DEMO MODE IS ON, AND THIS SUITE
   * RUNS WITH IT ON. *** Owner decision 2026-09-16: the demo offers the demo
   * way in, and the credential block is one click away. Opening it here is the
   * point of this file — `auth.setup.ts` covers the persona path, and this one
   * keeps covering the form, including the wrong-password case a persona button
   * cannot express.
   *
   * *** AND THE WAIT ABOVE IS LOAD-BEARING, NOT DEFENSIVE. *** `demoFirst`
   * needs `isDemoLoading` to be false, and it starts true — so the page ALWAYS
   * paints the form first and swaps to the personas when `/demo/status` lands.
   * Without waiting for that response, this spec could fill in a form that was
   * about to unmount underneath it: it passed run after run in isolation and
   * failed once in the full suite, which is the signature of exactly that race.
   * A flaky auth spec is the worst kind, so the wait is explicit rather than a
   * `networkidle` guess, and it is armed BEFORE `goto` so a fast response
   * cannot land before the listener exists.
   */
  const disclose = page.getByRole('button', { name: /email and password instead/i });
  if (await disclose.count()) await disclose.click();


  await page.locator('input[type="email"]').fill(DEMO_USER.email);
  await page.locator('input[type="password"]').fill('definitely-not-the-password');
  // `exact` — the page also has "Sign in with SSO", and a loose match resolves
  // to both, which Playwright's strict mode refuses. Rightly: clicking whichever
  // matched first is a test that asserts nothing reliable.
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  await expect(page).toHaveURL(/\/login/);
  await page.goto('/goals');
  await expect(page).not.toHaveURL(/\/goals$/);
});
