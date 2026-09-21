import { expect, pageIsLoaded, test } from './fixtures';

/**
 * The data statement, read in a real browser.
 *
 * *** THE OWNER'S REQUIREMENT IS THAT A USER *KNOWS*, WHICH IS A CLAIM ABOUT
 * RENDERED TEXT AND NOTHING ELSE *** (2026-09-14: *"i want to make sure the
 * users know whatever financial info they share with finpal never leaves their
 * server"*). A unit test can prove the component returns the right nodes and a
 * payload test can prove the server sends the right words; neither can tell you
 * a user sees them. `DataStatement` renders `null` when the fetch fails —
 * deliberately, because a promise must never be a client's guess — so the whole
 * feature can be silently absent while every other gate stays green. That is
 * precisely the shape of the `/coins` path bug this suite caught on 2026-09-14,
 * and precisely why the statement gets a browser test.
 */
test.describe('where your data lives', () => {
  test('Settings states it, in full, from the server', async ({ page }) => {
    await page.goto('/settings?tab=data');
    await pageIsLoaded(page, 'Settings');

    const block = page.getByLabel('Where your data lives');
    await expect(block).toBeVisible();

    // The heading, as a statement.
    await expect(block).toContainText(/stays on your server/i);

    // *** ALL THREE LINES, COUNTED. *** A dropped line renders a shorter
    // promise and nothing looks broken — the failure mode here is quiet.
    await expect(block).toContainText(/no analytics, no tracking and no AI/i);
    await expect(block).toContainText(/only to answer your own requests/i);
    await expect(block).toContainText(/switch on yourself/i);

    // The operator caveat belongs on this screen and not in onboarding.
    await expect(block).toContainText(/holds the database, the backups/i);
  });

  test('the statement never makes the blanket claim', async ({ page }) => {
    /*
     * *** THE HONESTY ASSERTION, IN THE BROWSER. *** Six things can leave an
     * instance (docs/DATA_BOUNDARIES.md), so an absolute "nothing ever leaves"
     * would be false. A future reword that tightens the copy into a promise the
     * code does not keep fails here as well as in the payload test — and this
     * is the half that sees what a user actually reads.
     */
    await page.goto('/settings?tab=data');
    await pageIsLoaded(page, 'Settings');
    const text = (await page.getByLabel('Where your data lives').innerText())
      .toLowerCase();
    expect(text).toContain('switch on yourself');
    expect(text).not.toMatch(/nothing (ever )?leaves/);
    expect(text).not.toContain('bank-grade');
    expect(text).not.toContain('military');
  });

  test('the signed-out pitch does not claim more than the product does', async ({ browser }) => {
    /*
     * *** THE LANDING PAGE IS THE MOST PUBLIC CLAIM IN THE PRODUCT AND IT WAS
     * THE FALSEST. *** It read *"No third-party access, ever"* until
     * 2026-09-14, which six opt-in outbound paths contradict. Checked in a
     * FRESH context with no storage state, because this is the page a visitor
     * with no account sees.
     */
    /* *** THE PITCH MOVED TO `/welcome` AND THIS TEST KEPT READING `/`. ***
       Owner decision 2026-09-17 made login the index, so `/` is now the sign-in
       form and this assertion was running against a page that has never made
       the claim. It failed loudly rather than passing vacuously only because it
       also asserts the honest sentence is PRESENT — a test that had checked
       only for the false claim's absence would have gone green on the wrong
       page and stayed green forever. */
    const context = await browser.newContext({ storageState: undefined });
    const fresh = await context.newPage();
    await fresh.goto('/welcome');
    const body = (await fresh.locator('body').innerText()).toLowerCase();
    expect(body).not.toContain('no third-party access');
    expect(body).toContain('no analytics, no tracking, no ai');
    await context.close();
  });
});
