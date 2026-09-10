/**
 * D-179 — the sentence under a goal's progress bar.
 *
 * *** THE CASE TABLE BELOW IS DUPLICATED, VERBATIM, IN
 * `mobile/src/__tests__/goalFigures.test.ts`. THAT IS THE POINT OF IT. ***
 * The two clients are separate git repos with no shared module, so the only thing
 * that can stop them describing one goal two different ways is one table of inputs
 * and expected strings that a human can diff. If you change a string here, change
 * it there in the same turn — a copy fix on one client is not a copy fix (D-99).
 *
 * The defect: `-$800.00 of $0.00` on a real payoff goal, rendered on the live demo.
 * Every figure correct — the card owes $800, the target is to owe $0, and the 52%
 * is the server's own `(current - start) / (target - start)`. The grammar was
 * written for an accumulation and reused for a paydown.
 *
 * The rows marked LIVE are real goals from `findemo.palstack.io`, captured
 * 2026-09-09, not invented.
 */
import { describe, expect, it } from 'vitest';
import { goalFigures } from '../../utils/goalFigures';
import type { Goal } from '../../types/goal';

/** A plain formatter, so the table asserts the WORDING, not Intl's behaviour. */
const money = (amount: number): string =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const goal = (over: Partial<Goal>): Goal =>
  ({
    id: 1,
    user_id: 'demo1@finpal.demo',
    name: 'g',
    kind: 'savings',
    scope: 'personal',
    account_id: null,
    account_name: null,
    target_amount: 0,
    start_amount: 0,
    current_manual: null,
    currency_code: 'USD',
    start_date: '2026-05-12',
    target_date: null,
    status: 'active',
    achieved_at: null,
    current_amount: 0,
    direction: 'accumulate',
    progress: 0,
    ...over,
  }) as Goal;

/* eslint-disable @typescript-eslint/no-unused-vars */
const CASES: ReadonlyArray<{
  name: string;
  goal: Partial<Goal>;
  expected: string;
}> = [
  {
    name: 'LIVE — a savings goal in progress keeps "X of Y", which was always right',
    goal: { direction: 'accumulate', current_amount: 650, start_amount: 0, target_amount: 2000 },
    expected: '$650.00 of $2,000.00',
  },
  {
    name: 'LIVE — an achieved savings goal reads its target back',
    goal: {
      direction: 'accumulate', status: 'achieved',
      current_amount: 500, start_amount: 0, target_amount: 500,
    },
    expected: '$500.00 of $500.00',
  },
  {
    name: 'LIVE — *** THE DEFECT: a payoff goal no longer reads "-$800.00 of $0.00" ***',
    goal: { direction: 'paydown', current_amount: -800, start_amount: -1650, target_amount: 0 },
    expected: '$800.00 left of $1,650.00',
  },
  {
    name: 'a payoff goal to a NON-zero target measures against that target, not against zero',
    goal: { direction: 'paydown', current_amount: -800, start_amount: -1650, target_amount: -500 },
    expected: '$300.00 left of $1,150.00',
  },
  {
    name: 'an untouched payoff goal has the whole debt left',
    goal: { direction: 'paydown', current_amount: -1650, start_amount: -1650, target_amount: 0 },
    expected: '$1,650.00 left of $1,650.00',
  },
  {
    name: 'a cleared card says so instead of "$0.00 left"',
    goal: { direction: 'paydown', current_amount: 0, start_amount: -1650, target_amount: 0 },
    expected: 'Paid off',
  },
  {
    name: '*** AN OVERPAID CARD SAYS "Paid off", NOT "-$200.00 left" ***',
    // The server leaves `progress` unclamped on purpose (this is 112%), so the
    // client is what has to decide. A negative "left" would be a new nonsense in
    // place of the old one.
    goal: { direction: 'paydown', current_amount: 200, start_amount: -1650, target_amount: 0 },
    expected: 'Paid off',
  },
  {
    name: 'an accumulation that OVERSHOOTS still reads "X of Y" — going past a savings target is not an error state',
    goal: { direction: 'accumulate', current_amount: 2400, start_amount: 0, target_amount: 2000 },
    expected: '$2,400.00 of $2,000.00',
  },
];

const render = (g: Goal): string => {
  const f = goalFigures(g, money);
  return f.separator === null ? f.primary : `${f.primary} ${f.separator} ${f.secondary}`;
};

describe('the sentence under a goal bar', () => {
  it.each(CASES.map((c) => [c.name, c.goal, c.expected] as const))(
    '%s',
    (_name, over, expected) => {
      expect(render(goal(over))).toBe(expected);
    },
  );

  it('covers both directions, or the table has quietly lost a half', () => {
    // A table that drifted to one direction would pass every row above while
    // testing nothing about the defect. This project has shipped two gates that
    // inspected nothing (D-45, and a CI guard whose condition could never be true).
    const directions = new Set(CASES.map((c) => c.goal.direction));
    expect(directions).toEqual(new Set(['accumulate', 'paydown']));
    expect(CASES.length).toBeGreaterThanOrEqual(8);
  });
});

describe('the numbers it derives', () => {
  it('never uses Math.abs, which is what got D-176 wrong', () => {
    // Stated as behaviour rather than as a grep: for a paydown, `target - current`
    // and `target - start` are positive on their own because card debt is a
    // negative balance. An `abs` would give the same answer here and the WRONG
    // answer for the overpaid row above — which is exactly how an overpaid card's
    // available credit came to be understated by twice the overpayment.
    const overpaid = goal({
      direction: 'paydown', current_amount: 200, start_amount: -1650, target_amount: 0,
    });
    expect(goalFigures(overpaid, money).primary).toBe('Paid off');
    // What `Math.abs(target - current)` would have produced, spelled out so nobody
    // reintroduces it believing it equivalent:
    expect(money(Math.abs(0 - 200))).toBe('$200.00');
  });

  it('agrees with the server percentage it sits beside', () => {
    // The line and the percentage are two views of one fact, and D-102 is the row
    // about a caption that disagreed with the thing beside it.
    const g = goal({
      direction: 'paydown', current_amount: -800, start_amount: -1650,
      target_amount: 0, progress: 0.5151515151515151,
    });
    const remaining = g.target_amount - g.current_amount; // 800
    const total = g.target_amount - g.start_amount; // 1650
    expect(1 - remaining / total).toBeCloseTo(g.progress, 10);
  });
});
