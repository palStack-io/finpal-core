/**
 * A health card's "unknown" guard must read the input ITS OWN metric came from.
 * AUDIT D-108, which is D-19's shape.
 *
 * *** THE DEFECT WAS A FALSE "UNKNOWN", NOT A FALSE NUMBER, AND THAT IS WHY NO
 * EXISTING TEST COULD SEE IT. *** Analytics.tsx gated Debt-to-Income on
 * `totals.income` and Emergency Fund on `totals.expenses`. Those two follow the
 * range selector. The ratios beside them deliberately do NOT — the page's own
 * comment says they "describe a position, not a period". So a windowed input gated
 * an unwindowed metric, and any range with no income in it hid a ratio the server
 * had already computed, replacing it with *"Add income transactions to calculate
 * this"* — advice to add data the user demonstrably had.
 *
 * MEASURED ON THE DEPLOYED DEMO, not reasoned about. With the default range:
 *
 *   GET /api/v1/analytics/health          -> debtToIncome 0.05, totalIncome 9000.0
 *   GET /api/v1/analytics/categories/top?type=income&start_date=2026-08-01…
 *                                        -> {"categories": []}
 *
 * so `totals.income` was 0 while the server's own denominator was £9,000, and the
 * card rendered Unknown. Both figures are pinned below.
 *
 * This tests the RULE rather than the rendered page: rendering Analytics.tsx needs
 * seven endpoints and both stores, and the rule is the thing that was wrong. The
 * source assertion at the end is what stops the guards drifting back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/** The shape `/analytics/health` actually returns — captured from the deploy. */
const DEMO_HEALTH = {
  totalIncome: 9000.0,
  totalExpenses: 5190.25,
  netSavings: 3809.75,
  savingsRate: 42.3,
  debtToIncome: 0.05,
  emergencyFundMonths: 3.5,
  liquidityRatio: 3.8,
  investmentReturn: null as number | null,
};

/** What the range-scoped totals were on the same day, for the default range. */
const WINDOWED_TOTALS = { income: 0, expenses: 1822.74 };

const shownWith = (guard: number, value: string) => (guard > 0 ? value : null);

describe('the guard reads the metric’s own denominator, not the range', () => {
  it('shows Debt-to-Income when the SERVER has income, even if the window has none', () => {
    // The regression, stated as the user-visible outcome.
    expect(shownWith(DEMO_HEALTH.totalIncome, '5.0%')).toBe('5.0%');
    // And the old guard, for contrast: it hid a real 5% ratio.
    expect(shownWith(WINDOWED_TOTALS.income, '5.0%')).toBeNull();
  });

  it('shows Emergency Fund from the server’s own expense total', () => {
    expect(shownWith(DEMO_HEALTH.totalExpenses, '3.5 months')).toBe('3.5 months');
  });

  it('still says unknown when the metric’s OWN input is genuinely absent', () => {
    // The guard must not become unconditional: D-19's original defect was a ratio
    // that collapsed to 0 for lack of income and rendered as a green "good", so an
    // account with debt and no income was congratulated on its debt-to-income.
    expect(shownWith(0, '0.0%')).toBeNull();
  });
});

describe('the source cannot drift back to the windowed totals', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', 'pages', 'Analytics.tsx'),
    'utf8'
  );
  // Comments quote the old expressions on purpose, so strip them first — a guard
  // that cannot tell code from prose punishes documenting the defect.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('gates neither health card on `totals.income` or `totals.expenses`', () => {
    expect(code).not.toMatch(/value=\{totals\.income\s*>\s*0/);
    expect(code).not.toMatch(/value=\{totals\.expenses\s*>\s*0/);
  });

  it('gates them on the health payload’s own totals', () => {
    expect(code).toMatch(/value=\{health\.totalIncome\s*>\s*0/);
    expect(code).toMatch(/value=\{health\.totalExpenses\s*>\s*0/);
  });

  it('is reading a file with the cards in it, not an empty string', () => {
    // A sweep over nothing passes every assertion above it (D-45).
    expect(source).toContain('Debt-to-Income Ratio');
    expect(source).toContain('Emergency Fund');
    expect(source.length).toBeGreaterThan(5000);
  });
});
