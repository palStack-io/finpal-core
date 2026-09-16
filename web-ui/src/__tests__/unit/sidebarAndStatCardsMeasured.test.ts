/**
 * Two defects found by MEASURING the deployed app rather than reading a screenshot.
 *
 * Both were reported by the owner in one sentence — "weird spacing issues inside the
 * categories, recurring and rules? also the pointsPal side nav looks off" — and neither
 * was what it looked like.
 *
 * ── 1. The sidebar ───────────────────────────────────────────────────────────
 *
 * pointsPal was not missing. `.sidebar-nav` has always been a correct scroll container:
 * `overflow-y: auto` means `min-height: auto` resolves to 0, so it shrinks rather than
 * pushing the footer out of the rail. Measured on the live app over CDP:
 *
 *     viewport 900px -> nav overflows by  14px, all 11 entries reachable
 *     viewport 760px -> nav overflows by 154px, and Groups, pointsPal and Settings sit
 *                       below the fold
 *
 * On macOS the scrollbar is an overlay that only appears while scrolling, so a clipped
 * rail is indistinguishable from a short one. The entries were in the DOM the whole time
 * — the MODULES heading too — and there was nothing on screen to say the list continued.
 *
 * *** I FIRST TOLD THE OWNER THIS WAS NOT A BUG, FROM READING A SCREENSHOT. *** It scrolls,
 * so mechanically it was fine; for the person using it, three navigation entries did not
 * exist. That is the second time in one session that inferring geometry from an image gave
 * the wrong answer, which is what D-100 has been open about since 2026-08-11.
 *
 * The fix is the affordance, not the fit: 672px of content cannot fit a 518px rail, and
 * shrinking entries enough to try would cost touch-target height.
 *
 * ── 2. The stat cards ────────────────────────────────────────────────────────
 *
 * The gaps BETWEEN blocks were a consistent 24px on all three pages. The inconsistency was
 * inside the cards: the same stat row measured **132px on Categories and 113px on Rules**,
 * with identical declared padding, because Categories wrapped its icon in a 40x40 tinted
 * box and Rules used a bare 20px glyph.
 *
 * *** A SHARED `StatCard` ALREADY EXISTED AND FOUR PAGES ALREADY USED IT. *** Dashboard,
 * Transactions, Budgets and Accounts went through the component; Categories and Rules each
 * kept a copy, and the copies drifted. That is U-03's thesis with a measurement attached: a
 * shell nothing shares is a shell nothing keeps in step.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

const THEME = 'src/styles/finpal-theme.css';
/*
 * *** THE RULE IS "NO PAGE HAND-ROLLS ITS STAT ROW", NOT "EVERY PAGE IMPORTS
 * StatCard". *** Those were the same sentence while there was one shared
 * component; they stopped being the same when the dashboard's four cards became
 * `TotalsRow` — hairline-separated cells inside the range's own card, because
 * four bordered panels under a panel is what "everything looks out of place"
 * meant (2026-09-15).
 *
 * `TotalsRow` is shared, is measured once, and is the thing Analytics will
 * adopt next. So the assertion now accepts EITHER shared component and still
 * fails a page that styles its own figures inline, which is the defect this
 * guard was written for: the same stat row measured 132px on Categories and
 * 113px on Rules because each built its own.
 *
 * Widening a guard is exactly how one goes blind, so the widening is bounded to
 * a named list of two components rather than to "imports something".
 */
const SHARED_STAT_COMPONENTS = ['StatCard', 'TotalsRow'];

const PAGES_USING_STATCARD = [
  'src/pages/Dashboard.tsx',
  'src/pages/Transactions.tsx',
  'src/pages/BudgetsMinimal.tsx',
  'src/pages/Accounts.tsx',
  'src/components/CategoryManagement.tsx',
  'src/components/TransactionRules.tsx',
];

/** The `.sidebar-nav { … }` rule body. */
function navRule(): string {
  const css = read(THEME);
  const i = css.indexOf('.sidebar-nav {');
  expect(i, '.sidebar-nav rule is gone').toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
}

describe('the sidebar rail says when it is clipped', () => {
  it('is still a scroll container', () => {
    // If this ever stops being true the footer gets pushed out of the rail instead, which
    // is a worse bug than the one being fixed.
    expect(navRule()).toMatch(/overflow-y:\s*auto/);
  });

  it('opts out of macOS overlay scrollbars, which is the whole fix', () => {
    const rule = navRule();
    expect(rule, 'no scrollbar-width — Firefox gets no persistent track').toMatch(
      /scrollbar-width:\s*(thin|auto)/,
    );
    expect(rule, 'no scrollbar-color').toMatch(/scrollbar-color:/);
  });

  it('styles the WebKit scrollbar, which is what Chrome and Safari read', () => {
    // `scrollbar-width` alone leaves Chrome on macOS with an overlay scrollbar, so both
    // mechanisms are required and asserting only one would pass while the bug remained.
    const css = read(THEME);
    expect(css).toMatch(/\.sidebar-nav::-webkit-scrollbar\s*\{/);
    expect(css).toMatch(/\.sidebar-nav::-webkit-scrollbar-thumb\s*\{/);
  });

  it('gives the thumb a visible colour rather than transparent', () => {
    const css = read(THEME);
    const thumb = css.slice(
      css.indexOf('.sidebar-nav::-webkit-scrollbar-thumb {'),
      css.indexOf('}', css.indexOf('.sidebar-nav::-webkit-scrollbar-thumb {')),
    );
    expect(thumb).toMatch(/background:\s*var\(--/);
    expect(thumb).not.toMatch(/background:\s*transparent/);
  });
});

describe('every page renders its stat row through the one shared component', () => {
  it.each(PAGES_USING_STATCARD)('%s renders its figures through a shared component', (rel) => {
    const src = read(rel);
    const adopted = SHARED_STAT_COMPONENTS.filter(
      (name) => new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\}`).test(src));
    expect(adopted, `${rel} imports none of ${SHARED_STAT_COMPONENTS.join(', ')}`)
      .not.toEqual([]);
  });

  it.each(['src/components/CategoryManagement.tsx', 'src/components/TransactionRules.tsx'])(
    '%s no longer hand-rolls a stat card',
    (rel) => {
      const src = read(rel);
      // `bigStatStyle` is the stat figure itself, and StatCard renders its own. A page
      // still using it directly is still drawing a stat card by hand.
      expect(src, 'still renders bigStatStyle outside StatCard').not.toMatch(
        /<p style=\{bigStatStyle\}>/,
      );
      // NOTE: an earlier version of this test also banned a fixed 40x40 icon chip, on the
      // grounds that it was the visual tell of the hand-rolled card. It matched a colour
      // swatch button and a loading spinner — both entirely correct — because it keyed on
      // a SIZE rather than on the role. Deleted rather than narrowed with exceptions: a
      // guard that needs a list of things it is allowed to match is not measuring the
      // property it claims to. `bigStatStyle` names the role, so it is the whole check.
    },
  );

  it('StatCard is a single definition, not one per page', () => {
    // Guards against the obvious wrong fix for the drift: copying the component.
    const definitions = PAGES_USING_STATCARD.filter((rel) =>
      /export const StatCard/.test(read(rel)),
    );
    expect(definitions).toEqual([]);
  });
});
