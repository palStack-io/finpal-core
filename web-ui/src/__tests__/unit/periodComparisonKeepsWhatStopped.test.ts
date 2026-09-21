/**
 * A comparison's hard cases are the categories that are in ONE period only.
 *
 * *** THE ONE A NAIVE IMPLEMENTATION DROPS IS THE INTERESTING ONE. *** Iterate
 * the current period and you get every category that grew, shrank or appeared —
 * and you silently lose every category the user STOPPED spending on, which is
 * frequently the most useful line on the screen. It is invisible when wrong:
 * the chart renders, the bars are correct, and the missing row looks like a
 * category that simply does not exist.
 *
 * *** AND A PERCENTAGE FROM ZERO IS NOT A BIG PERCENTAGE, IT IS NO PERCENTAGE.
 * *** `deltaPct` is null when the previous period was 0 — never Infinity, never
 * a triumphant 100%. Same rule as `holdingTotals.gainPercent`, same reason: a
 * figure the data cannot support must be absent rather than impressive.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { comparePeriods, type PeriodCategory } from '../../utils/periodComparison';

/** Jul–Sep and Apr–Jun shapes from the demo, trimmed to the interesting rows. */
const NOW: PeriodCategory[] = [
  { name: 'Housing', amount: 5400 },
  { name: 'Groceries', amount: 500.49 },
  { name: 'Coffee', amount: 60 },
  { name: 'Streaming', amount: 25 },
];
const BEFORE: PeriodCategory[] = [
  { name: 'Housing', amount: 5400 },
  { name: 'Groceries', amount: 300 },
  { name: 'Gym', amount: 240 },
];

const row = (c: ReturnType<typeof comparePeriods>, name: string) =>
  c!.rows.find((r) => r.name === name)!;

describe('a category that STOPPED is kept', () => {
  it('includes Gym, which is in the previous period only', () => {
    const c = comparePeriods(NOW, BEFORE)!;
    const gym = row(c, 'Gym');
    expect(gym, 'the category that stopped was dropped').toBeTruthy();
    expect(gym.now).toBe(0);
    expect(gym.before).toBe(240);
    expect(gym.delta).toBe(-240);
    expect(gym.stopped).toBe(true);
    expect(gym.isNew).toBe(false);
  });

  it('marks a category that only exists NOW as new, with no percentage', () => {
    const c = comparePeriods(NOW, BEFORE)!;
    const s = row(c, 'Streaming');
    expect(s.isNew).toBe(true);
    // Not Infinity, not 100 — there is no percentage change from nothing.
    expect(s.deltaPct).toBeNull();
    expect(s.delta).toBe(25);
  });

  it('computes a real percentage when there IS a previous figure', () => {
    const c = comparePeriods(NOW, BEFORE)!;
    const g = row(c, 'Groceries');
    expect(g.delta).toBeCloseTo(200.49, 2);
    expect(g.deltaPct).toBeCloseTo(66.83, 1);
  });

  it('keeps an unchanged category rather than hiding it', () => {
    // Housing is identical in both. A comparison that only showed CHANGES would
    // make the biggest line item vanish, and its absence would read as zero.
    const h = row(comparePeriods(NOW, BEFORE), 'Housing');
    expect(h.now).toBe(5400);
    expect(h.delta).toBe(0);
    expect(h.deltaPct).toBe(0);
  });
});

describe('it is sorted by what MOVED, not by what is biggest', () => {
  it('puts Gym and Groceries above Housing', () => {
    // Housing is by far the largest figure and changed by nothing. Sorting by
    // amount would reproduce the spending chart one tab over with a second bar
    // bolted on; the question here is "what moved".
    const names = comparePeriods(NOW, BEFORE)!.rows.map((r) => r.name);
    expect(names.indexOf('Gym')).toBeLessThan(names.indexOf('Housing'));
    expect(names.indexOf('Groceries')).toBeLessThan(names.indexOf('Housing'));
  });
});

describe('the headline totals come from EVERY category, not the drawn rows', () => {
  it('totals the whole list even when the chart truncates', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `c${i}`, amount: 10 }));
    const c = comparePeriods(many, [])!;
    expect(c.rows.length).toBeLessThan(many.length);   // truncated for the chart
    expect(c.nowTotal).toBe(200);                      // but not for the figure
    expect(c.beforeTotal).toBe(0);
    expect(c.deltaPct).toBeNull();                     // no percentage from zero
  });
});

describe('it refuses rather than drawing an empty comparison', () => {
  it('returns null when neither period has anything', () => {
    expect(comparePeriods([], [])).toBeNull();
    expect(comparePeriods([{ name: 'x', amount: 0 }], [])).toBeNull();
  });

  it('drops a negative row instead of drawing a negative length', () => {
    // A refund booked as a negative expense is real here and cannot be a bar.
    const c = comparePeriods(
      [{ name: 'Shopping', amount: 100 }, { name: 'Refund', amount: -40 }], [])!;
    expect(c.rows.map((r) => r.name)).not.toContain('Refund');
    expect(c.nowTotal).toBe(100);
  });

  it('folds duplicate names rather than drawing one category twice', () => {
    // `Category` name collisions are a known shape here — six of the demo's own
    // category names are duplicated.
    const c = comparePeriods(
      [{ name: 'Food', amount: 30 }, { name: 'Food', amount: 20 }], [])!;
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0].now).toBe(50);
  });

  it('treats a blank name as Uncategorised rather than discarding it', () => {
    const c = comparePeriods([{ name: '  ', amount: 75 }], [])!;
    expect(c.rows[0].name).toBe('Uncategorised');
  });
});

describe('the chart does not decide which direction is good', () => {
  /**
   * *** THE SAME COMPONENT DRAWS SPENDING AND INCOME, AND "UP" MEANS THE
   * OPPOSITE IN EACH. *** The first version of `PeriodCompareChart` inked
   * `delta > 0` red unconditionally — right for spending, and exactly backwards
   * on the income card, where it would have shown a raise in red and a pay cut
   * in green.
   *
   * *** IT IS INVISIBLE WHEN WRONG, WHICH IS WHY IT IS ASSERTED HERE. *** Both
   * colours are legitimate, the figures are right either way, and nothing about
   * a red "+£500 income" looks like a bug until you read it. No contrast gate
   * can see it: `--re-ink` and `--g-ink` both clear AA.
   *
   * The helper stays neutral — it returns a SIGNED delta and says nothing about
   * whether the sign is welcome. That is the property under test: the direction
   * is the caller's to declare, and this file is where that separation is
   * recorded.
   */
  it('reports a signed delta and no opinion about it', () => {
    const more = comparePeriods([{ name: 'Pay', amount: 3000 }],
                                [{ name: 'Pay', amount: 2500 }])!;
    const less = comparePeriods([{ name: 'Pay', amount: 2000 }],
                                [{ name: 'Pay', amount: 2500 }])!;
    expect(more.rows[0].delta).toBe(500);
    expect(less.rows[0].delta).toBe(-500);
    // Nothing in the row says "good" or "bad", and nothing should: the same
    // +500 is welcome on income and unwelcome on spending.
    expect(Object.keys(more.rows[0]).sort()).toEqual(
      ['before', 'delta', 'deltaPct', 'isNew', 'name', 'now', 'stopped']);
  });

  it('keeps the component honest: PeriodCompareChart REQUIRES the direction', () => {
    /* A source check, because the alternative is a default and a default is
       silently wrong for one of the two callers. If `upIsGood` ever becomes
       optional, this says so before a raise turns red again. */
    const src = readFileSync(
      join(process.cwd(), 'src/components/analytics/PeriodCompareChart.tsx'), 'utf8');
    expect(src).toMatch(/upIsGood: boolean;/);
    expect(src).not.toMatch(/upIsGood\?:/);
  });
});
