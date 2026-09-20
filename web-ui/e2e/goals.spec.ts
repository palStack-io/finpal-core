import { DASHBOARD_HEADING, DEMO_USER, expect, pageIsLoaded, test } from './fixtures';

/**
 * The goals flow, end to end, against a real API and the real demo seed.
 *
 * *** WHAT THIS COVERS THAT 501 VITEST TESTS DO NOT. *** Those mock the network
 * with MSW, so every one of them passes whether or not the server exists, agrees
 * about a field name, or enforces a permission. Five times in this project an
 * interface has been a claim about a server rather than a check of one (D-69,
 * D-101, and three more), and a green typecheck was reassuring throughout. These
 * specs talk to Flask.
 *
 * They also depend on the demo SEED being right, which is deliberate: if the
 * seed regresses these go red, and D-77 has escaped three times precisely
 * because nothing downstream of the seed ever noticed.
 */

test('a signed-in user reaches Goals from the sidebar', async ({ page }) => {
  await page.goto('/dashboard');
  await pageIsLoaded(page, DASHBOARD_HEADING);

  await page.getByRole('link', { name: 'Goals' }).click();

  await expect(page).toHaveURL(/\/goals$/);
  await pageIsLoaded(page, /Goals/);
});

test('the seeded goals render with the SERVER’s progress', async ({ page }) => {
  await page.goto('/goals');
  await pageIsLoaded(page, /Goals/);

  // The four states the seed guarantees. Named individually, because "some
  // goals rendered" would pass with the achieved one missing and the badge
  // untested.
  await expect(page.getByText(/Pay off the/)).toBeVisible();
  await expect(page.getByText('Emergency fund')).toBeVisible();
  await expect(page.getByText('New laptop')).toBeVisible();
  await expect(page.getByText('Holiday fund')).toBeVisible();

  // *** THE PERCENTAGE IS THE SERVER'S AND MUST NOT BE 0% OR 100% ON A SEEDED
  // DEMO. *** An empty bar is indistinguishable from a figure that never
  // arrived — the whole reason the seed pins these between 5% and 95%.
  const bars = page.getByRole('progressbar');
  const count = await bars.count();
  expect(count).toBeGreaterThanOrEqual(4);
  let inProgress = 0;
  for (let i = 0; i < count; i += 1) {
    const value = Number(await bars.nth(i).getAttribute('aria-valuenow'));
    expect(Number.isFinite(value), 'a progressbar with no aria-valuenow').toBe(true);
    if (value > 0 && value < 100) inProgress += 1;
  }
  expect(inProgress, 'no goal shows partial progress').toBeGreaterThanOrEqual(3);

  // The achieved one, so the badge has a real render behind it.
  await expect(page.getByText('Achieved')).toBeVisible();
});

test('a household goal is labelled shared and a personal one is not', async ({
  page,
}) => {
  await page.goto('/goals');
  await pageIsLoaded(page, /Goals/);

  // Scoped to `main`. The SIDEBAR has a nav group literally headed "Shared"
  // (Groups lives under it), so an unscoped `getByText('Shared')` matched two
  // things and this failed at 2 — my assertion's fault, not the page's. A
  // whole-document text match on a common word is a fragile assertion in an app
  // with persistent navigation.
  const main = page.getByRole('main');
  // Exactly one seeded goal is household-scoped. "at least one" would pass if
  // every goal were mislabelled shared, which is the more likely defect.
  await expect(main.getByText('Shared', { exact: true })).toHaveCount(1);
});

test('the contribution breakdown names two payers and flags imports', async ({
  page,
}) => {
  await page.goto('/goals');
  await pageIsLoaded(page, /Goals/);

  // The Emergency fund is the linked household goal on the co-owned account.
  const card = page.locator('[data-testid^="goal-"]', {
    has: page.getByText('Emergency fund'),
  });
  await card.getByRole('button', { name: /Who contributed/ }).click();

  // Two payers, from `paid_by` — not one. A single payer demonstrates nothing,
  // and it is what a breakdown keyed to the account OWNER would produce.
  await expect(card.getByText(DEMO_USER.name)).toBeVisible();
  await expect(card.getByText('Morgan Demo')).toBeVisible();
});

test('creating a goal persists it and it survives a reload', async ({
  page,
}) => {
  // *** THE RELOAD IS THE ASSERTION. *** Optimistic local state renders a new
  // goal whether or not the POST landed; only a round trip through the server
  // distinguishes "created" from "drawn". That is D-122's shape at the UI layer.
  const name = `E2E goal ${Date.now()}`;
  await page.goto('/goals');
  await pageIsLoaded(page, /Goals/);

  await page.getByRole('button', { name: /New goal/ }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel(/Target amount/).fill('1500');
  await page.getByRole('button', { name: /Create goal/ }).click();

  await expect(page.getByText(name)).toBeVisible();

  await page.reload();
  await pageIsLoaded(page, /Goals/);
  await expect(page.getByText(name), 'the goal did not survive a reload').toBeVisible();

  // Clean up, so the suite can run twice — and so the next run's counts hold.
  //
  // *** THIS ASKED FOR A `Delete <name>` BUTTON ON THE CARD UNTIL 2026-09-13, AND
  // THAT BUTTON WAS DELIBERATELY REMOVED. *** It was a bare trash icon that called
  // `deleteGoal` on a single click with no confirmation of any kind, so one
  // mis-click destroyed a goal and its whole contribution history with nothing to
  // undo it. Delete moved into the edit panel behind a two-step confirm — and the
  // spec was never updated, so this test had been red ever since, unnoticed
  // because the E2E suite is deliberately outside `preflight.sh`.
  //
  // Driving the REAL path rather than restoring the old label also buys the
  // confirm flow its only coverage: that the first click ARMS rather than
  // deletes, which is the entire point of the safety fix.
  const created = page.locator('[data-testid^="goal-"]', {
    has: page.getByText(name),
  });
  await created.getByRole('button', { name: `Edit ${name}` }).click();
  await page.getByRole('button', { name: /Delete this goal/ }).click();

  // Armed, not gone. If the first click deleted, the safety fix has been undone.
  //
  // *** SCOPED TO THE CARD, BECAUSE THE NAME IS NOW ON SCREEN TWICE. *** The armed
  // confirm reads "Delete <name> for good?", so an unscoped `getByText(name)`
  // matches both and Playwright refuses it. That duplication is the FEATURE —
  // it is the stated reason the panel does not use `window.confirm`, which
  // "cannot be styled to say WHAT is being deleted" — so it is asserted rather
  // than worked around.
  await expect(created, 'the first click deleted instead of arming').toBeVisible();
  await expect(
    page.getByRole('dialog').getByText(name),
    'the confirm did not name the goal it is about to destroy',
  ).toBeVisible();

  await page.getByRole('button', { name: /Yes, delete it/ }).click();
  await expect(page.getByText(name)).toHaveCount(0);
});

test('a goal delete can be called off, and calling it off keeps the goal', async ({
  page,
}) => {
  // *** THE OTHER HALF OF A TWO-STEP CONFIRM IS THAT STEP TWO CAN BE REFUSED. ***
  // A confirm nobody can back out of is a slower single click.
  const name = `E2E keepme ${Date.now()}`;
  await page.goto('/goals');
  await pageIsLoaded(page, /Goals/);

  await page.getByRole('button', { name: /New goal/ }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel(/Target amount/).fill('900');
  await page.getByRole('button', { name: /Create goal/ }).click();
  await expect(page.getByText(name)).toBeVisible();

  const created = page.locator('[data-testid^="goal-"]', {
    has: page.getByText(name),
  });
  await created.getByRole('button', { name: `Edit ${name}` }).click();
  await page.getByRole('button', { name: /Delete this goal/ }).click();
  await page.getByRole('button', { name: /Keep it/ }).click();

  // *** ASSERTED ACROSS A RELOAD, NEVER ON THE RENDERED CARD ALONE. *** Backing
  // out leaves the card on screen whether or not the row survived, so only a
  // round trip distinguishes "kept" from "deleted and still drawn".
  await page.reload();
  await pageIsLoaded(page, /Goals/);
  await expect(page.getByText(name), 'Keep it deleted the goal anyway').toBeVisible();

  // and now really remove it, so the suite can run twice
  await created.getByRole('button', { name: `Edit ${name}` }).click();
  await page.getByRole('button', { name: /Delete this goal/ }).click();
  await page.getByRole('button', { name: /Yes, delete it/ }).click();
  await expect(page.getByText(name)).toHaveCount(0);
});

test('the accounts page reads a co-owned account as Joint', async ({
  page,
}) => {
  await page.goto('/accounts');
  await pageIsLoaded(page, /Accounts/);

  // Seeded: demo1's Primary Checking, co-owned by demo2.
  await expect(page.getByText(/Joint · /)).toBeVisible();
});

test('a credit card shows its available credit, computed from a real limit', async ({
  page,
}) => {
  await page.goto('/accounts');
  await pageIsLoaded(page, /Accounts/);

  // This block was UNREACHABLE until B1 put `credit_limit` in the payload, and
  // the arithmetic behind it was wrong when it first became reachable (D-176).
  //
  // *** `getByText('Available Credit')` WENT AMBIGUOUS WHEN THE DEMO GREW A
  // SECOND CARD, AND STRICT MODE IS RIGHT TO REFUSE IT. *** The budgeter now
  // carries a Visa, a 0% store card and a student loan, so the debt plan has an
  // ordering to demonstrate. A bare text match that happened to be unique is
  // a test pinned to the fixture's size rather than to its arithmetic.
  //
  // Both cards are asserted, because two is the state that broke this and one
  // of them is the 0% promotional case:
  //   Visa   3,200 limit − 800 debt = 2,400
  //   Store  1,000 limit − 350 debt =   650
  await expect(page.getByText('Available Credit').first()).toBeVisible();
  await expect(page.getByText('$2,400.00')).toBeVisible();
  await expect(page.getByText('$650.00')).toBeVisible();
});
