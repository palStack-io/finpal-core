/**
 * A Sankey claims conservation. These tests are that claim, checked.
 *
 * *** THE PROPERTY IS NOT "THE NUMBERS ARE RIGHT", IT IS "THE SIDES MATCH". ***
 * Every other chart on the Analytics page can draw the top eight categories and
 * be honest, because a bar is a bar and a reader reads it as one. A flow diagram
 * says the width entering a node is the width leaving it, and a reader takes
 * that literally — it is the entire reason the chart is worth drawing. A Sankey
 * that drops a small category, or clamps a negative to zero, still LOOKS like a
 * Sankey while having stopped conserving. There is no visual symptom.
 *
 * So the assertions below are about sums and about refusals, not about layout,
 * and the fixtures are the live demo's own figures.
 */
import { describe, it, expect } from 'vitest';
import { incomeFlow, type FlowCategory } from '../../utils/incomeFlow';

const sum = (nodes: Array<{ value: number }>) =>
  nodes.reduce((t, n) => t + n.value, 0);

/** Jul–Sep on `findemo.palstack.io`, read from the API on 2026-09-16. */
const DEMO_INCOME: FlowCategory[] = [
  { name: 'Income', amount: 9000 },
  { name: 'Uncategorised', amount: 1900 },
];
const DEMO_EXPENSES: FlowCategory[] = [
  { name: 'Housing', amount: 5400 },
  { name: 'Groceries', amount: 500.49 },
  { name: 'Shopping', amount: 357.11 },
  { name: 'Transportation', amount: 215.5 },
  { name: 'Health & Fitness', amount: 149.97 },
  { name: 'Electricity', amount: 134.5 },
  { name: 'Food & Dining', amount: 99.24 },
  { name: 'Internet', amount: 79.99 },
  { name: 'Phone', amount: 60 },
  { name: 'Subscriptions', amount: 45.99 },
  { name: 'Coffee', amount: 33.5 },
  { name: 'Parking', amount: 18 },
  { name: 'Other', amount: 7.94 },
];

describe('the two sides always balance', () => {
  it('conserves on the demo period, to the cent', () => {
    const flow = incomeFlow(DEMO_INCOME, DEMO_EXPENSES)!;
    expect(flow).not.toBeNull();
    expect(sum(flow.inflows)).toBeCloseTo(sum(flow.outflows), 6);
    expect(sum(flow.inflows)).toBeCloseTo(flow.total, 6);
  });

  it('loses nothing to bundling — 13 expense categories, 7 nodes, same total', () => {
    const flow = incomeFlow(DEMO_INCOME, DEMO_EXPENSES)!;
    // The point of the bundle: fewer nodes, identical sum.
    expect(flow.outflows.length).toBeLessThan(DEMO_EXPENSES.length);
    expect(flow.spent).toBeCloseTo(7102.23, 2);
    const drawnSpend = sum(flow.outflows.filter((n) => n.id !== 'out-unspent'));
    expect(drawnSpend).toBeCloseTo(7102.23, 2);
  });

  it('names how many categories a bundle stands for', () => {
    // A bundle labelled "Other" reads as a category called Other — and this
    // fixture HAS a category called Other, which is exactly the collision.
    const flow = incomeFlow(DEMO_INCOME, DEMO_EXPENSES)!;
    const rest = flow.outflows.find((n) => n.id === 'out-rest')!;
    expect(rest).toBeTruthy();
    expect(rest.label).toMatch(/^\d+ smaller categories$/);
    expect(rest.bundled).toBe(true);
  });

  it('marks the unspent remainder as not-a-category', () => {
    const flow = incomeFlow(DEMO_INCOME, DEMO_EXPENSES)!;
    const unspent = flow.outflows.find((n) => n.id === 'out-unspent')!;
    expect(unspent.value).toBeCloseTo(10900 - 7102.23, 2);
    expect(unspent.bundled).toBe(true);
  });
});

describe('spending more than came in is drawn as an input, not a negative', () => {
  /* *** THE DEMO REALLY HAS THIS MONTH: September is 250.00 in, 2,359.72 out.
     *** So this is not a defensive test for an impossible state. */
  const income: FlowCategory[] = [{ name: 'Income', amount: 250 }];
  const expenses: FlowCategory[] = [
    { name: 'Housing', amount: 1800 },
    { name: 'Groceries', amount: 559.72 },
  ];

  it('adds a named inflow for the shortfall', () => {
    const flow = incomeFlow(income, expenses)!;
    const shortfall = flow.inflows.find((n) => n.id === 'in-shortfall')!;
    expect(shortfall).toBeTruthy();
    expect(shortfall.label).toBe('From savings or credit');
    expect(shortfall.value).toBeCloseTo(2359.72 - 250, 2);
  });

  it('still conserves, which clamping to zero would not', () => {
    const flow = incomeFlow(income, expenses)!;
    expect(sum(flow.inflows)).toBeCloseTo(sum(flow.outflows), 6);
    // The failure mode this prevents: outflows wider than inflows, on a chart
    // whose whole meaning is that they match.
    expect(flow.total).toBeCloseTo(2359.72, 2);
  });

  it('never emits a node with a negative or zero width', () => {
    for (const flow of [
      incomeFlow(income, expenses)!,
      incomeFlow(DEMO_INCOME, DEMO_EXPENSES)!,
    ]) {
      for (const node of [...flow.inflows, ...flow.outflows]) {
        expect(node.value, `${node.label}`).toBeGreaterThan(0);
      }
    }
  });

  it('signs `net` so the caller can say which case it is', () => {
    expect(incomeFlow(income, expenses)!.net).toBeLessThan(0);
    expect(incomeFlow(DEMO_INCOME, DEMO_EXPENSES)!.net).toBeGreaterThan(0);
  });
});

describe('it refuses rather than draws an empty frame', () => {
  it('returns null when nothing came in and nothing went out', () => {
    expect(incomeFlow([], [])).toBeNull();
    expect(incomeFlow([{ name: 'x', amount: 0 }], [])).toBeNull();
  });

  it('draws income with no spending, which is a real period', () => {
    const flow = incomeFlow([{ name: 'Salary', amount: 1000 }], [])!;
    expect(flow).not.toBeNull();
    expect(flow.outflows).toHaveLength(1);
    expect(flow.outflows[0].label).toBe('Unspent');
    expect(sum(flow.inflows)).toBeCloseTo(sum(flow.outflows), 6);
  });

  it('draws spending with no income, entirely from the shortfall', () => {
    const flow = incomeFlow([], [{ name: 'Rent', amount: 800 }])!;
    expect(flow.inflows).toHaveLength(1);
    expect(flow.inflows[0].id).toBe('in-shortfall');
    expect(sum(flow.inflows)).toBeCloseTo(800, 6);
  });

  it('drops a negative category instead of letting it subtract a width', () => {
    // A refund booked as a negative expense is real in this data model, and a
    // negative width is not drawable. Refused, not clamped — and the sides must
    // still match afterwards.
    const flow = incomeFlow(
      [{ name: 'Salary', amount: 1000 }],
      [{ name: 'Rent', amount: 500 }, { name: 'Refund', amount: -50 }],
    )!;
    expect(flow.outflows.map((n) => n.label)).not.toContain('Refund');
    expect(flow.spent).toBeCloseTo(500, 6);
    expect(sum(flow.inflows)).toBeCloseTo(sum(flow.outflows), 6);
  });

  it('keeps an Uncategorised bucket rather than discarding it', () => {
    // The server really returns one, with a null colour. It is "we do not know
    // which category", which is an answer — not an error and not a zero.
    const flow = incomeFlow(
      [{ name: null, amount: 400 }],
      [{ name: '  ', amount: 100 }],
    )!;
    expect(flow.inflows[0].label).toBe('Uncategorised');
    expect(flow.outflows[0].label).toBe('Uncategorised');
    expect(flow.earned).toBeCloseTo(400, 6);
  });
});
