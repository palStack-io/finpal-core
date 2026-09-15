/**
 * The fixed/flexible split on the Categories page, and the two ways it can lie.
 *
 * *** PINNED TO America/Denver, LIKE `monthKeys.test.ts`. *** `lastFullMonth`
 * is built from local date parts precisely so it cannot repeat D-206, and a
 * test running in UTC would not be able to tell whether it had.
 *
 * *** THE AUGUST ROWS AND THE CATEGORY NAMES ARE THE LIVE DEMO'S. *** Fetched
 * from `findemo.palstack.io`: eleven categories with spend in August 2026, and
 * a category table with SIX duplicated names, one of which ("Business")
 * resolves to two different effective spending types. The expected totals —
 * fixed $2,059.49, flexible $833.03, non-monthly $0.00 — are the figures the
 * mockup draws, so this is also the assertion that keeps the drawing and the
 * app agreeing.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { lastFullMonth } from '../../utils/monthKeys';
import { spendingTypeByName, splitSpendByGroup } from '../../utils/spendingGroups';

const TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/Denver'; });
afterAll(() => { process.env.TZ = TZ; });

/** The demo's August spend, exactly as `/analytics/categories/top` returns it. */
const AUGUST = [
  { name: 'Housing', amount: 1800 },
  { name: 'Groceries', amount: 283.56 },
  { name: 'Shopping', amount: 199.99 },
  { name: 'Transportation', amount: 163.5 },
  { name: 'Electricity', amount: 134.5 },
  { name: 'Internet', amount: 79.99 },
  { name: 'Food & Dining', amount: 77.99 },
  { name: 'Health & Fitness', amount: 49.99 },
  { name: 'Water', amount: 45 },
  { name: 'Doctor Visits', amount: 30 },
  { name: 'Entertainment', amount: 28 },
];

/**
 * The eleven categories above, with the ids, parents and `spending_type`
 * values the demo actually holds.
 *
 * *** WRITTEN OUT OF THE SERVER, NOT GUESSED, AND THE FIRST VERSION WAS
 * GUESSED. *** It had Transportation as `fixed` (it is flexible) and invented
 * five of the amounts, so the split came to 2047 against a real 2059.49 — a
 * fixture that could not produce the case it was written to pin, which is
 * D-165. Re-derived with `GET /categories` and
 * `GET /analytics/categories/top?start_date=2026-08-01&end_date=2026-08-31`.
 */
const CATEGORIES = [
  { id: 748, name: 'Housing', parent_id: null, spending_type: 'fixed' as const },
  { id: 754, name: 'Electricity', parent_id: 748, spending_type: 'fixed' as const },
  { id: 755, name: 'Water', parent_id: 748, spending_type: 'fixed' as const },
  { id: 757, name: 'Internet', parent_id: 748, spending_type: 'fixed' as const },
  { id: 773, name: 'Food & Dining', parent_id: null, spending_type: 'flexible' as const },
  // No type of its own: it inherits `flexible` from Food & Dining, which is the
  // one-level rollup the server does in `budget.py:72`.
  { id: 774, name: 'Groceries', parent_id: 773, spending_type: null },
  { id: 781, name: 'Shopping', parent_id: null, spending_type: 'flexible' as const },
  { id: 763, name: 'Transportation', parent_id: null, spending_type: 'flexible' as const },
  { id: 791, name: 'Health & Fitness', parent_id: null, spending_type: 'flexible' as const },
  { id: 792, name: 'Doctor Visits', parent_id: 791, spending_type: null },
  { id: 801, name: 'Entertainment', parent_id: null, spending_type: 'flexible' as const },
];

describe('lastFullMonth', () => {
  it('is the month BEFORE this one, not this one', () => {
    // Mid-September: a split computed over 12 days would call rent almost all
    // of spending, and tell the reader nothing is theirs to move.
    expect(lastFullMonth(new Date(2026, 8, 15)).key).toBe('2026-08');
    expect(lastFullMonth(new Date(2026, 8, 15)).label).toBe('August 2026');
  });

  it('spans the whole month, to its real last day', () => {
    const august = lastFullMonth(new Date(2026, 8, 15));
    expect(august.start).toBe('2026-08-01');
    expect(august.end).toBe('2026-08-31');
    // February, and a leap year, without a table of month lengths.
    expect(lastFullMonth(new Date(2026, 2, 10)).end).toBe('2026-02-28');
    expect(lastFullMonth(new Date(2024, 2, 10)).end).toBe('2024-02-29');
  });

  it('crosses the year boundary', () => {
    const dec = lastFullMonth(new Date(2026, 0, 4));
    expect(dec.key).toBe('2025-12');
    expect(dec.end).toBe('2025-12-31');
  });

  it('*** ON THE FIRST OF THE MONTH, LOCAL TIME, IT IS STILL THE MONTH BEFORE ***', () => {
    // The D-206 shape: 1 September 00:30 in Denver is 06:30 UTC on the 1st, but
    // 1 September 00:30 UTC is 18:30 on 31 August in Denver. Built from local
    // parts, this answers August either way.
    expect(lastFullMonth(new Date(2026, 8, 1, 0, 30)).key).toBe('2026-08');
  });
});

describe('the split the Categories page shows', () => {
  it('is the mockup\'s three figures, from the demo\'s own data', () => {
    const split = splitSpendByGroup(AUGUST, spendingTypeByName(CATEGORIES));
    expect(split.fixed).toBeCloseTo(2059.49, 2);
    expect(split.flexible).toBeCloseTo(833.03, 2);
    expect(split.non_monthly).toBe(0);
    expect(split.unattributable).toEqual([]);
    // And they account for every penny of the month.
    const total = AUGUST.reduce((s, r) => s + r.amount, 0);
    expect(split.fixed + split.flexible + split.non_monthly + split.unsorted)
      .toBeCloseTo(total, 2);
  });

  it('inherits a subcategory from its parent, one level, as the server does', () => {
    // Electricity, Water and Internet have no type of their own and sit under
    // a fixed Housing: 1800 + 96 + 45 + 54 + 52 (Transportation) = 2047... plus
    // Doctor Visits is flexible via Health & Fitness, not fixed.
    const byName = spendingTypeByName(CATEGORIES);
    expect(byName.get('Electricity')).toBe('fixed');
    expect(byName.get('Doctor Visits')).toBe('flexible');
  });
});

describe('what it refuses to attribute', () => {
  it('*** A DUPLICATED NAME WITH TWO DIFFERENT TYPES IS REFUSED, NOT GUESSED ***', () => {
    // Measured on the demo: six names are duplicated and "Business" resolves
    // to two different effective types. Picking one would put real money in
    // the wrong column with nothing on screen to say so.
    const withDuplicate = [
      ...CATEGORIES,
      { id: 90, name: 'Business', parent_id: null, spending_type: 'flexible' as const },
      { id: 91, name: 'Business', parent_id: null, spending_type: null },
    ];
    const byName = spendingTypeByName(withDuplicate);
    expect(byName.get('Business')).toBe('ambiguous');

    const split = splitSpendByGroup([...AUGUST, { name: 'Business', amount: 500 }], byName);
    expect(split.unattributable).toEqual(['Business']);
    expect(split.fixed + split.flexible + split.non_monthly + split.unsorted)
      .toBeCloseTo(AUGUST.reduce((s, r) => s + r.amount, 0), 2);
  });

  it('a duplicated name that AGREES is not ambiguous — it is just a duplicate', () => {
    const twice = [
      ...CATEGORIES,
      { id: 92, name: 'Home Insurance', parent_id: null, spending_type: 'fixed' as const },
      { id: 93, name: 'Home Insurance', parent_id: null, spending_type: 'fixed' as const },
    ];
    expect(spendingTypeByName(twice).get('Home Insurance')).toBe('fixed');
  });

  it('spend naming a category the payload never carried is refused too', () => {
    const split = splitSpendByGroup([{ name: 'Deleted thing', amount: 12 }],
      spendingTypeByName(CATEGORIES));
    expect(split.unattributable).toEqual(['Deleted thing']);
    expect(split.fixed + split.flexible + split.non_monthly + split.unsorted).toBe(0);
  });

  it('an unsorted category is counted as unsorted, not folded into flexible', () => {
    // "Unsorted" is a real state with its own meaning: finPal does not know.
    // Adding it to flexible would claim the user said it was movable.
    const cats = [{ id: 50, name: 'Mystery', parent_id: null, spending_type: null }];
    const split = splitSpendByGroup([{ name: 'Mystery', amount: 80 }], spendingTypeByName(cats));
    expect(split.unsorted).toBe(80);
    expect(split.flexible).toBe(0);
  });
});

/**
 * September, which is what Analytics' "what was actually yours to move"
 * sentence is computed from. Nine categories, live from the demo.
 */
const SEPTEMBER = [
  { name: 'Housing', amount: 1800 },
  { name: 'Food & Dining', amount: 238.18 },
  { name: 'Groceries', amount: 216.93 },
  { name: 'Shopping', amount: 157.12 },
  { name: 'Transportation', amount: 52 },
  { name: 'Health & Fitness', amount: 49.99 },
  { name: 'Entertainment', amount: 26.98 },
  { name: 'Electricity', amount: 12.5 },
  { name: 'Internet', amount: 6.02 },
];

describe("Analytics' \"what was actually yours to move\"", () => {
  it('is 76.3% fixed and $559.72 movable, which is the mockup\'s reading', () => {
    const split = splitSpendByGroup(SEPTEMBER, spendingTypeByName(CATEGORIES));
    const total = SEPTEMBER.reduce((s, r) => s + r.amount, 0);
    expect(total).toBeCloseTo(2559.72, 2);
    // The wedge that invites "I overspend on housing" is 70% of the month.
    expect(split.fixed / total * 100).toBeGreaterThan(70);
    // *** THE FIGURE THE SENTENCE STATES IS `flexible`, NOT "total minus
    // fixed". *** Those differ the moment anything is non-monthly or unsorted,
    // and calling either of those "yours to move" would claim the user said
    // something they have not.
    expect(split.flexible).not.toBe(total - split.fixed - 0.0001);
    expect(split.flexible + split.fixed + split.non_monthly + split.unsorted)
      .toBeCloseTo(total, 2);
  });

  it('says nothing at all when nothing is attributable', () => {
    // The page renders the sentence only for a non-null split with fixed > 0.
    // This is the data half of that: an unknown category table yields zeroes
    // and an unattributable list, never a confident "0% was fixed".
    const split = splitSpendByGroup(SEPTEMBER, new Map());
    expect(split.fixed).toBe(0);
    expect(split.flexible).toBe(0);
    expect(split.unattributable).toHaveLength(SEPTEMBER.length);
  });
});
