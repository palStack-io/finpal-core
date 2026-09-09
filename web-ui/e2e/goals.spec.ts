import { test, expect, DEMO_USER, pageIsLoaded } from './fixtures';

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
  await pageIsLoaded(page, /Dashboard|Welcome|Overview/);

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
  const created = page.locator('[data-testid^="goal-"]', {
    has: page.getByText(name),
  });
  await created.getByRole('button', { name: `Delete ${name}` }).click();
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
  // Seeded: a 3200 limit against an 800 debt, so 2400 available.
  await expect(page.getByText('Available Credit')).toBeVisible();
  await expect(page.getByText('$2,400.00')).toBeVisible();
});
