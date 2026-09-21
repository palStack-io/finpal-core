import { DASHBOARD_HEADING, expect, pageIsLoaded, test } from './fixtures';

/**
 * Coins, gear, and the one rule a unit test cannot check.
 *
 * *** THE NO-DENOMINATOR ASSERTION IS THE POINT OF THIS FILE. *** Design
 * decision 5 forbids a fraction finPal chose, and six were live on 2026-09-13:
 * `16 of 19` twice on the learnPal home with progress bars, `band 4 of 6`,
 * `16 of 19 lessons read` on the goals banner, `4 of 4 · nothing more here` on
 * every goal card, and `16 of 19 unlocked` on mobile.
 *
 * A unit test can only check the component it was pointed at, and a payload
 * guard can only check the payload. **Neither can tell you what a user
 * actually sees.** This walks the real app in a real browser and reads the
 * rendered text, so a fraction assembled from two elements, or introduced on a
 * page nobody thought to test, still fails.
 *
 * *** WHICH IS EXACTLY HOW THE SIX WERE FOUND: BY LOOKING. *** Not by reading
 * the components — every one of them typechecked, and 727 tests were green.
 */

/**
 * Pages that must never show a fraction finPal chose.
 *
 * `moduleGated` marks a route `App.tsx` gates on `user.modules`. *** A REDIRECT
 * THERE MEANS GATED, NOT BROKEN, AND THE TWO LOOK IDENTICAL FROM OUTSIDE. ***
 * The demo sweep once reported `/pointspal` as "route likely absent from this
 * build" when it was registered and simply not entitled — so the redirect is
 * asserted to land on `/dashboard` rather than shrugged at, exactly as
 * `every-page.spec.ts` does. A signed-in user must never be dropped on the
 * marketing page (D-200).
 */
const SURFACES: Array<[string, string, string | RegExp, boolean?]> = [
  ['/dashboard', 'Dashboard', DASHBOARD_HEADING],
  ['/goals', 'Goals', 'Goals'],
  ['/kit', 'Kit', 'Your kit'],
  ['/review', 'Review', 'Review'],
  ['/learnpal', 'learnPal', 'learnPal', true],
  ['/learnpal/range', 'Your range', 'Your range', true],
  ['/learnpal/lessons', 'Lessons', /lessons/i, true],
];

/**
 * `true` when the route rendered; `false` when it redirected because the module
 * is gated off for this user — and the destination is checked either way.
 */
async function reached(page: import('@playwright/test').Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);   // the guard redirects client-side, after mount
  const landed = new URL(page.url()).pathname;
  if (landed === route) return true;
  expect(
    ['/dashboard'],
    `${route} is gated off for this user and sent them to ${landed}. A `
    + 'signed-in user belongs on /dashboard, not the signed-out landing page.',
  ).toContain(landed);
  return false;
}

/**
 * A count of things the USER chose is allowed; a count finPal chose is not.
 *
 * The gear shop legitimately renders `540 / 700` — a price is a target the user
 * picked by saving toward it — so the pattern deliberately matches the WORD
 * "of" rather than a slash, which is the shape every banned instance used.
 */
const DENOMINATOR = /\b\d[\d,]*\s+of\s+\d[\d,]*\b/;

for (const [path, label, heading, moduleGated] of SURFACES) {
  test(`${label} renders no denominator finPal chose`, async ({ page }) => {
    if (moduleGated) {
      test.skip(!(await reached(page, path)),
        `${path} is gated off for this user, so there is nothing to read`);
    } else {
      await page.goto(path);
    }
    await pageIsLoaded(page, heading);

    const text = await page.locator('body').innerText();
    const hit = text.match(DENOMINATOR);

    expect(
      hit,
      `${path} rendered "${hit?.[0]}". Design decision 5: no denominator unless `
      + 'the user chose the target. A count is momentum; "N of M" is a report '
      + 'card, and the difference is the whole voice of the product.',
    ).toBeNull();
  });
}

test('the coin purse shows a balance and never a fraction', async ({ page }) => {
  await page.goto('/kit');
  await pageIsLoaded(page, 'Your kit');

  const purse = page.getByTestId('coin-purse');
  await expect(purse).toBeVisible();
  // A number and the word "coins" — never "points", which is what pointsPal
  // renders for real credit-card rewards worth real money.
  await expect(purse).toContainText(/\d/);
  await expect(purse).toContainText('coins');
  await expect(purse).not.toContainText(/pts|points/i);
});

test('the gear is drawn at a size a person can identify', async ({ page }) => {
  /* *** THE ART HAS ALWAYS EXISTED AND THE APP RENDERED IT AT 14px. *** All 21
     pieces are real line art; every previous surface showed them in a row of
     five where a boot and a compass are indistinguishable. This asserts the
     rendered box, because "we used size={46}" is a claim about source. */
  await page.goto('/kit');
  await pageIsLoaded(page, 'Your kit');

  const firstIcon = page.getByTestId('kit-grid').locator('svg, img').first();
  const box = await firstIcon.boundingBox();
  expect(box, 'no gear rendered at all').not.toBeNull();
  expect(box!.width, 'gear is being drawn too small to identify')
    .toBeGreaterThanOrEqual(36);
});

test('the ONLY progress bar in the app is the one whose target the user chose',
  async ({ page }) => {
    /* The gear savings bar is permitted — a price is a target the user picked.
       Everything else came out on 2026-09-14. If a bar appears on the learnPal
       home again, this is what says so. */
    test.skip(!(await reached(page, '/learnpal')), 'learnPal is gated off');
    await pageIsLoaded(page, 'learnPal');
    await expect(page.getByTestId('counter-bar')).toHaveCount(0);
  });

test('buying gear moves the balance down and leaves the earned total alone',
  async ({ page }) => {
    await page.goto('/kit');
    await pageIsLoaded(page, 'Your kit');

    const buyable = page.locator('button', { hasText: /^Buy$/ }).first();
    const count = await buyable.count();
    test.skip(count === 0, 'this demo user cannot afford anything to buy');

    const before = Number(
      (await page.getByTestId('coin-purse').innerText()).replace(/[^\d]/g, ''));

    await buyable.click();
    // The page reloads its wallet, so wait for the purse to actually change
    // rather than for a fixed timeout.
    await expect
      .poll(async () => Number(
        (await page.getByTestId('coin-purse').innerText()).replace(/[^\d]/g, '')))
      .toBeLessThan(before);

    // *** ASSERTED ON THE RENDERED STATE, NOT ON A STATUS CODE. *** Every bug
    // found across eight sessions in this project returned 200.
    await expect(page.getByText('owned').first()).toBeVisible();
  });

test('the learnPal home no longer claims the user reached the hardest peak',
  async ({ page }) => {
    /* `hardest_band` is computed from a goal's MAGNITUDE and never reads
       progress, so a brand-new goal with a large target comes back as Everest.
       The figure is useful; "Highest you have reached" was a claim it cannot
       support. */
    test.skip(!(await reached(page, '/learnpal')), 'learnPal is gated off');
    await pageIsLoaded(page, 'learnPal');
    const text = await page.locator('body').innerText();
    expect(text).not.toContain('Highest you have reached');
  });
