import { expect, type Page } from '@playwright/test';
import path from 'path';

/**
 * Shared constants and helpers for the E2E suite.
 *
 * The signed-in state is NOT built here. `auth.setup.ts` drives the real login
 * form once and saves whatever the app stored; every spec picks that up through
 * `storageState` in `playwright.config.ts`. The first version of this file
 * assembled an `auth-storage` blob by hand and it was wrong in a way that still
 * got past the route guard — see the note in `auth.setup.ts`.
 */

export const DEMO_USER = {
  email: 'demo1@finpal.demo',
  password: 'demo1234',
  name: 'Alex Demo',
};

export const STORAGE_STATE = path.join(process.cwd(), 'e2e/.auth/demo1.json');

/**
 * Wait for a page to have actually finished loading its data.
 *
 * *** ASSERTING AGAINST A SPINNER IS HOW AN E2E SUITE GOES GREEN ON A BROKEN
 * PAGE, AND ASSERTING AGAINST A HEADING IS ONLY SLIGHTLY BETTER. *** The heading
 * is static markup: it renders whether the fetch succeeded, failed or is still
 * in flight. The Goals page proved it — heading present, and an
 * `alert: Network Error` where the goals should have been.
 *
 * So this waits for the heading, for the spinner to go, AND asserts there is no
 * error alert. The contrast walk's capture step learned the first half the same
 * way: "wait for the loading spinner to go, or we capture a spinner and report
 * zero."
 */
export async function pageIsLoaded(page: Page, heading: string | RegExp) {
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  await expect(page.getByLabel(/^Loading/)).toHaveCount(0);
  await expect(
    page.getByRole('alert'),
    'the page rendered an error instead of its data',
  ).toHaveCount(0);
}

export { expect };
export { test } from '@playwright/test';
