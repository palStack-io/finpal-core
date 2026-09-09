import AxeBuilder from '@axe-core/playwright';
import { test, expect, pageIsLoaded } from './fixtures';

/**
 * Does the UI meet the standard, in a real browser, on real data.
 *
 * *** THIS IS THE HALF THE EXISTING WALKS CANNOT DO, AND THE GAP IS NOT SMALL.
 * *** `contrast-walk` computes colour ratios over jsdom captures. It is good at
 * exactly one WCAG criterion and blind to every other: a button with no
 * accessible name, an input with no label, a page with no landmark, a heading
 * order that jumps h1 -> h4, a control reachable only by mouse. axe checks ~90
 * rules against the rendered accessibility tree, which only exists in a real
 * browser.
 *
 * WHY axe RATHER THAN HAND-WRITTEN ASSERTIONS: more coverage per line, and it is
 * the actual published standard rather than one person's idea of it. A
 * hand-rolled list of checks is a gate keyed to the things somebody remembered
 * — D-127, three times over in this project.
 *
 * *** SCOPED TO wcag2a/wcag2aa AND NOT "everything axe knows". *** Best-practice
 * rules are opinions, and a gate that fails on an opinion is a gate that gets
 * skipped. AA is the line the contrast walk already holds the app to, so this is
 * the same standard applied to the rest of the criteria.
 *
 * Colour-contrast is DISABLED here, deliberately: `contrast-walk` already gates
 * it, resolves colours against the actual painted background, and carries a
 * ratchet with a recorded baseline. Two gates on one criterion means two places
 * to update and two chances to disagree — D-18's rule, applied to gates.
 */

const STANDARD = ['wcag2a', 'wcag2aa'];

const PAGES: Array<[string, string, string | RegExp]> = [
  ['dashboard', '/dashboard', /Dashboard|Welcome|Overview/],
  ['accounts', '/accounts', /Accounts/],
  ['transactions', '/transactions', /Transactions/],
  ['goals', '/goals', /Goals/],
  ['budgets', '/budgets', /Budget/],
  ['analytics', '/analytics', /Analytics/],
];

for (const [name, path, heading] of PAGES) {
  test(`${name} meets WCAG 2 AA`, async ({ page }) => {
    await page.goto(path);
    await pageIsLoaded(page, heading);

    const results = await new AxeBuilder({ page })
      .withTags(STANDARD)
      .disableRules(['color-contrast'])
      .analyze();

    // The failure message is the point. `expect(violations).toEqual([])` prints
    // a wall of axe's internal node objects and tells you nothing you can act
    // on; this prints the rule, its impact, and the element.
    const readable = results.violations.map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      elements: v.nodes.slice(0, 3).map((n) => n.html.slice(0, 120)),
    }));
    expect(readable, `${name}: ${readable.length} WCAG AA violation(s)`).toEqual([]);
  });
}

test('dark mode meets the same standard, not a lower one', async ({ page }) => {
  // *** DARK MODE IS WHERE THIS PROJECT'S COLOUR DEFECTS LIVE. *** Two of the
  // three AA failures found in the goals page were dark-only, and one of my own
  // fixes measured WORSE in dark because the token themed and the surface did
  // not. A gate that only ever runs in light mode would have passed both.
  await page.goto('/dashboard');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await pageIsLoaded(page, /Dashboard|Welcome|Overview/);

  const results = await new AxeBuilder({ page })
    .withTags(STANDARD)
    .disableRules(['color-contrast'])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('every page has exactly one h1 and no skipped heading level', async ({
  page,
}) => {
  // Not an axe rule at AA (`page-has-heading-one` is best-practice, and
  // `heading-order` is too), but it is the thing that makes a page navigable by
  // screen reader and it is cheap to assert. Kept separate from the axe run so
  // that a failure here is legible as a structure problem, not a WCAG citation.
  for (const [name, path, heading] of PAGES) {
    await page.goto(path);
    await pageIsLoaded(page, heading);

    const levels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
        .filter((h) => (h as HTMLElement).offsetParent !== null)
        .map((h) => Number(h.tagName[1])));

    expect(levels.filter((l) => l === 1), `${name}: h1 count`).toHaveLength(1);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i] - levels[i - 1],
        `${name}: heading jumps h${levels[i - 1]} -> h${levels[i]}`)
        .toBeLessThanOrEqual(1);
    }
  }
});
