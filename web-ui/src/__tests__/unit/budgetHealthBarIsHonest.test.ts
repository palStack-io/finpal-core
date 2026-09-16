/**
 * *** THE BUDGET HEALTH BAR DREW BANDS FOR COUNTS THAT WERE ZERO. ***
 *
 * `flex: warning || 0.1` gave every empty band a floor so it would not collapse.
 * Measured on the live demo, on a page reading "4 on track, 0 at risk, 0 over":
 * the bar rendered 208.6px of green, **5.2px of amber and 5.2px of clay**. Two
 * visible bands for two counts of zero, directly under the labels saying zero.
 *
 * A picture is read faster than a label, so this told every user with a healthy
 * month that something was at risk and something was over. That is this
 * project's recurring failure: the figure was right and the thing next to it
 * was not (D-102 told users their net worth rose 43% while the line fell).
 *
 * *** ASSERTED ON THE SOURCE, WHICH IS A COMPROMISE WORTH NAMING. *** The
 * honest test would render the page and measure the bands, but this grid is
 * built inside an IIFE in a 1,400-line page with no seam to mount it through,
 * and the contrast walk cannot reach `/budgets` in a state with zero at-risk
 * budgets. What is pinned here is the SHAPE that caused it — a falsy-fallback
 * quantity — plus the conditional that replaced it. A stronger test needs the
 * page split up first, and that is a bigger change than the defect warrants.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(
  join(__dirname, '..', '..', 'pages', 'BudgetsMinimal.tsx'), 'utf8');

/** Comments here explain the defect at length; a comment is not a render. */
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('the budget health bar', () => {
  const code = codeOnly(SRC);

  it('reads the page at all', () => {
    expect(code).toContain('Budget Health');
    expect(code.length).toBeGreaterThan(5000);
  });

  it('never gives an empty band a minimum size', () => {
    // The exact shape that shipped, and the two obvious re-spellings of it.
    expect(code).not.toMatch(/flex:\s*onTrack\s*\|\|/);
    expect(code).not.toMatch(/flex:\s*warning\s*\|\|/);
    expect(code).not.toMatch(/flex:\s*over\s*\|\|/);
    expect(code).not.toMatch(/Math\.max\(\s*(onTrack|warning|over)\s*,/);
  });

  it('renders a band only when it holds something', () => {
    for (const band of ['onTrack', 'warning', 'over']) {
      expect(code).toMatch(new RegExp(`\\{${band} > 0 &&`));
    }
  });

  it('keeps the empty bar visible as a track rather than as nothing', () => {
    // All three counts can legitimately be zero — a user with no budgets at
    // all. The bar must still occupy its space instead of collapsing the card.
    expect(code).toMatch(/background: 'var\(--progress-track\)'[^}]*\}\}>\s*\{onTrack > 0/);
  });

  it('does not strand the health card in its own grid row', () => {
    // Five cards in `repeat(auto-fit, minmax(250px, 1fr))` is four columns and
    // a lonely fifth: ~880px of dead space at 1440px, measured on the live page.
    expect(code).toMatch(/gridColumn: '1 \/ -1'/);
  });
});
