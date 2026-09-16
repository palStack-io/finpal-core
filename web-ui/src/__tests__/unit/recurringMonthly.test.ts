/**
 * The monthly figure on a recurring row, and the ground it sums to.
 *
 * *** THE DEMO'S EIGHT ROWS ARE THE FIXTURE, AND THEY COME FROM THE LIVE
 * SERVER. *** `GET /api/v1/recurring` on the public demo returns Rent 1200
 * monthly, Council tax 148, Electricity & gas 96, Broadband 34, Mobile 18,
 * Streaming 16, Weekly shop top-up 15 WEEKLY and Contents insurance 132
 * YEARLY. Those last two are the whole point of this file: they are the only
 * rows whose stated amount is not what they cost per month, and a page that
 * added the eight numbers up as printed would report a ground of $1,659.00
 * against a true $1,588.00.
 *
 * `$1,588.00` is also the figure the mockup's range draws as the ground, so
 * this is the one assertion that keeps two screens telling one story.
 */
import { describe, expect, it } from 'vitest';
import { monthlyEquivalent, isConvertible, monthlyLabel } from '../../utils/recurringMonthly';
import { groundHeight } from '../../utils/mountainGeometry';

/** Exactly what the demo serves, in payload order. */
const DEMO_ROWS = [
  { description: 'Rent', amount: 1200, frequency: 'monthly' },
  { description: 'Council tax', amount: 148, frequency: 'monthly' },
  { description: 'Electricity & gas', amount: 96, frequency: 'monthly' },
  { description: 'Broadband', amount: 34, frequency: 'monthly' },
  { description: 'Mobile', amount: 18, frequency: 'monthly' },
  { description: 'Streaming', amount: 16, frequency: 'monthly' },
  { description: 'Weekly shop top-up', amount: 15, frequency: 'weekly' },
  { description: 'Contents insurance', amount: 132, frequency: 'yearly' },
];

describe('monthlyEquivalent', () => {
  it('leaves a monthly row alone', () => {
    expect(monthlyEquivalent(1200, 'monthly')).toBe(1200);
  });

  it('uses 52 weeks a year, not 48', () => {
    // 15 x 4 = 60 is the tempting wrong answer, and it loses £60 a year.
    expect(monthlyEquivalent(15, 'weekly')).toBeCloseTo(65, 10);
    expect(monthlyEquivalent(15, 'weekly')).not.toBe(60);
  });

  it('uses 365 days a year, not 30 a month', () => {
    expect(monthlyEquivalent(1, 'daily')).toBeCloseTo(365 / 12, 10);
    expect(monthlyEquivalent(1, 'daily')).not.toBe(30);
  });

  it('spreads a yearly bill over twelve months', () => {
    expect(monthlyEquivalent(132, 'yearly')).toBeCloseTo(11, 10);
  });

  it('is case and whitespace tolerant, because the column is free text', () => {
    expect(monthlyEquivalent(100, ' Monthly ')).toBe(100);
    expect(monthlyEquivalent(100, 'WEEKLY')).toBeCloseTo(100 * 52 / 12, 10);
  });

  it('*** REFUSES AN UNKNOWN FREQUENCY RATHER THAN ASSUMING MONTHLY ***', () => {
    // `frequency` is an unconstrained String(20). Treating a fifth value as
    // monthly would put a wrong number inside the figure a user reads as their
    // fixed cost, which is the one thing §6 forbids.
    for (const unknown of ['fortnightly', 'quarterly', 'biweekly', '', null, undefined, 'MONTHLYish']) {
      expect(monthlyEquivalent(100, unknown), `frequency ${JSON.stringify(unknown)}`).toBeNull();
    }
    expect(isConvertible('quarterly')).toBe(false);
    expect(isConvertible('monthly')).toBe(true);
  });

  it('refuses a missing or non-finite amount instead of reading it as zero', () => {
    // Zero is a claim ("this costs nothing"); absent is not.
    for (const bad of [null, undefined, NaN, Infinity]) {
      expect(monthlyEquivalent(bad as number, 'monthly')).toBeNull();
    }
    expect(monthlyEquivalent(0, 'monthly')).toBe(0);
  });

  it('preserves a negative rather than hiding it behind Math.abs', () => {
    expect(monthlyEquivalent(-50, 'monthly')).toBe(-50);
  });
});

describe('monthlyLabel', () => {
  const money = (n: number) => `$${n.toFixed(2)}`;

  it('reads as the mockup does', () => {
    expect(monthlyLabel(15, 'weekly', money)).toBe('$65.00 / mo');
    expect(monthlyLabel(132, 'yearly', money)).toBe('$11.00 / mo');
  });

  it('says nothing at all when it cannot convert, rather than printing a dash', () => {
    expect(monthlyLabel(15, 'quarterly', money)).toBeNull();
  });
});

describe('the ground the demo actually stands on', () => {
  it('is $1,588.00, which is not the sum of the printed amounts', () => {
    const printed = DEMO_ROWS.reduce((sum, r) => sum + r.amount, 0);
    expect(printed).toBe(1659); // what a page that ignored frequency would show

    // *** `groundHeight` DOES THE ADDING, NOT THIS FILE. *** It existed with a
    // test and no production caller; giving it one is the point of the pass,
    // and writing a second sum here would be D-101 — two places computing one
    // presentation, which is how the two screens drift apart.
    const ground = groundHeight({
      recurringMonthly: DEMO_ROWS.map((r) => monthlyEquivalent(r.amount, r.frequency) ?? 0),
    });
    expect(ground).toBeCloseTo(1588, 6);
  });

  it('the two rows that differ are the weekly and the yearly one', () => {
    const differs = DEMO_ROWS.filter(
      (r) => monthlyEquivalent(r.amount, r.frequency) !== r.amount);
    expect(differs.map((r) => r.description))
      .toEqual(['Weekly shop top-up', 'Contents insurance']);
  });

  it('a row it cannot convert is excluded from the total, not guessed at', () => {
    const rows = [...DEMO_ROWS, { description: 'Odd one', amount: 999, frequency: 'quarterly' }];
    const convertible = rows
      .map((r) => monthlyEquivalent(r.amount, r.frequency))
      .filter((n): n is number => n !== null);
    expect(convertible).toHaveLength(8);
    expect(groundHeight({ recurringMonthly: convertible })).toBeCloseTo(1588, 6);
    // And the caller must be able to SEE that it happened, so it can say so.
    expect(rows.filter((r) => !isConvertible(r.frequency)).map((r) => r.description))
      .toEqual(['Odd one']);
  });
});
