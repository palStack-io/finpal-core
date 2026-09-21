import AxeBuilder from '@axe-core/playwright';
import { DASHBOARD_HEADING, expect, pageIsLoaded, test } from './fixtures';

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
  ['dashboard', '/dashboard', DASHBOARD_HEADING],
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
  await pageIsLoaded(page, DASHBOARD_HEADING);

  const results = await new AxeBuilder({ page })
    .withTags(STANDARD)
    .disableRules(['color-contrast'])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

/**
 * *** THE HEADING-OUTLINE CHECK MOVED TO `every-page.spec.ts`. ***
 *
 * It lived here, over the six-page `PAGES` list above, and that list is exactly
 * the problem `every-page.spec.ts` was written to fix: six routes audited, the
 * app has twenty-one. Widening it found **four more pages** jumping `h1 -> h3`
 * — /categories, /recurring, /rules and /groups — none of which this file could
 * ever have seen.
 *
 * It is not duplicated in both places on purpose. This repo's own rule, written
 * at the top of this file for colour-contrast: two gates on one criterion means
 * two places to update and two chances to disagree (D-18). The version over
 * there is a strict superset of the one that was here AND its route list is
 * DERIVED from `App.tsx` plus the module manifests, so a page added tomorrow is
 * checked tomorrow rather than when somebody remembers to type it in.
 *
 * *** AND THE SAME ARGUMENT APPLIES TO THE axe RUNS LEFT IN THIS FILE, WHICH IS
 * SAID HERE RATHER THAN LEFT FOR SOMEBODY TO NOTICE. *** `every-page.spec.ts`
 * runs axe at the same tags, with `color-contrast` disabled the same way, over
 * all 21 routes in both themes — so the six `PAGES` tests below and the dark-mode
 * test are a subset of it too. They are KEPT, deliberately: a failure scoped to
 * one named page is faster to read than the same failure inside a 40-test walk,
 * and deleting a working gate is a bigger risk than carrying a redundant one.
 * That is a judgement, not an oversight, and it is the next thing to consolidate
 * if this file is touched again. **D-221 was a comment that described a world
 * that had moved on; a comment that quietly contradicts its own file is the same
 * defect waiting to happen.**
 */
