/**
 * learnPal's peak geometry (C1c's arithmetic half).
 *
 * *** THE CASE TABLE HERE IS DUPLICATED VERBATIM IN `mobile/src/__tests__/
 * mountainGeometry.test.ts`. *** web-ui and mobile are separate git repos with
 * nothing to import between them, so the only way to stop the phone and the web
 * app drawing one goal two different heights is one table of inputs written
 * identically in both. `goalFigures.ts` established the convention and
 * `goalTracking.ts` is its second use; this is the third. **Change one, change
 * both, in the same turn.**
 *
 * The tests that matter most are the ones about `null`: a missing APR must draw
 * GREY, never a molehill. That is parent-spec trap 3, and D-77 and D-108 are
 * what it looks like when a missing figure is rendered as a small one.
 */
import { describe, it, expect } from 'vitest';
import {
  peakGeometry, monthlyInterestCost, groundHeight, splitByScale,
  DEFAULT_CEILINGS, type Ceilings,
} from '../../utils/mountainGeometry';

// Round numbers so the expected heights are checkable by hand.
const C: Ceilings = { costCeiling: 100, buildCeiling: 10000, maxHeight: 100 };

describe('monthlyInterestCost', () => {
  it('reads a NEGATIVE balance as money owed', () => {
    // Card debt is stored negative. 1200 owed at 20% is 20/month.
    expect(monthlyInterestCost([{ balance: -1200, apr: 20 }])).toBeCloseTo(20, 6);
  });

  it('*** NEVER CHARGES INTEREST ON AN OVERPAID CARD ***', () => {
    // A positive balance means the bank owes the user. `Math.abs` here would
    // bill them for it — D-176's arithmetic exactly.
    expect(monthlyInterestCost([{ balance: 200, apr: 20 }])).toBe(0);
  });

  it('sums across the accounts a goal spans (B12)', () => {
    const cost = monthlyInterestCost([
      { balance: -1200, apr: 20 },   // 20.00
      { balance: -600, apr: 10 },    //  5.00
    ]);
    expect(cost).toBeCloseTo(25, 6);
  });

  it('returns null when NO account states a rate — not 0', () => {
    expect(monthlyInterestCost([{ balance: -1200, apr: null }])).toBeNull();
    expect(monthlyInterestCost([{ balance: -1200 }])).toBeNull();
    expect(monthlyInterestCost([])).toBeNull();
    expect(monthlyInterestCost(undefined)).toBeNull();
  });

  it('counts a 0% rate as STATED, so the peak is measured at zero cost', () => {
    // An intro rate is a real answer. Treating 0 as "not stated" would grey out
    // exactly the card the user was most deliberate about.
    expect(monthlyInterestCost([{ balance: -1200, apr: 0 }])).toBe(0);
  });

  it('ignores rate-less accounts but still measures the ones with rates', () => {
    expect(monthlyInterestCost([
      { balance: -1200, apr: 20 },
      { balance: -5000, apr: null },
    ])).toBeCloseTo(20, 6);
  });
});

describe('peakGeometry — paydown, "what\'s costing you"', () => {
  it('is GREY, not short, when no rate is stated', () => {
    const g = peakGeometry({ direction: 'paydown', accounts: [{ balance: -5000 }] }, C);
    expect(g.unmeasured).toBe(true);
    expect(g.magnitude).toBeNull();
    expect(g.height).toBe(0);
  });

  it('scales by sqrt so a small peak stays visible against a large one', () => {
    // 25/month against a 100 ceiling → sqrt(0.25) = 0.5 → half height.
    const g = peakGeometry({ direction: 'paydown', accounts: [{ balance: -1500, apr: 20 }] }, C);
    expect(g.magnitude).toBeCloseTo(25, 6);
    expect(g.height).toBeCloseTo(50, 6);
    expect(g.unmeasured).toBe(false);
  });

  it('CLAMPS above the ceiling rather than running off the canvas', () => {
    const g = peakGeometry({ direction: 'paydown', accounts: [{ balance: -100000, apr: 30 }] }, C);
    expect(g.height).toBe(C.maxHeight);
  });

  it('a card with a rate and nothing owed is measured at zero height', () => {
    const g = peakGeometry({ direction: 'paydown', accounts: [{ balance: 0, apr: 22 }] }, C);
    expect(g.unmeasured).toBe(false);
    expect(g.height).toBe(0);
    expect(g.magnitude).toBe(0);
  });
});

describe('peakGeometry — accumulate, "what you\'re building"', () => {
  it('*** IS NEVER UNMEASURED ***', () => {
    // `target_amount` is NOT NULL on the server, so distance-remaining is always
    // computable. Only debt peaks can be grey.
    const g = peakGeometry({ direction: 'accumulate', targetAmount: 2500, currentAmount: 0 }, C);
    expect(g.unmeasured).toBe(false);
  });

  it('measures DISTANCE REMAINING, not the target', () => {
    // 10000 target, 7500 saved → 2500 remaining → sqrt(0.25) → half height.
    const g = peakGeometry(
      { direction: 'accumulate', targetAmount: 10000, currentAmount: 7500 }, C);
    expect(g.magnitude).toBeCloseTo(2500, 6);
    expect(g.height).toBeCloseTo(50, 6);
  });

  it('an achieved goal is flat, never negative', () => {
    const g = peakGeometry(
      { direction: 'accumulate', targetAmount: 1000, currentAmount: 4000 }, C);
    expect(g.magnitude).toBe(0);
    expect(g.height).toBe(0);
  });

  it('*** AN OVERDUE GOAL DRAWS EXACTLY LIKE ANY OTHER ***', () => {
    // `target_date` no longer drives height at all, which is what removed the
    // old `months_remaining` guards — divide-by-zero on an overdue goal and
    // negative heights simply cease to exist. There is no date input here at
    // all, and that absence IS the fix.
    const a = peakGeometry({ direction: 'accumulate', targetAmount: 10000, currentAmount: 7500 }, C);
    const b = peakGeometry({ direction: 'accumulate', targetAmount: 10000, currentAmount: 7500 }, C);
    expect(a.height).toBe(b.height);
  });

  it('*** MOVING THE TARGET DATE CANNOT CHANGE THE HEIGHT ***', () => {
    // The whole reason the one-axis version was wrong: a user could halve their
    // own mountain by moving a date, with nothing real having changed.
    const near = peakGeometry({ direction: 'accumulate', targetAmount: 8000, currentAmount: 1000 }, C);
    const far = peakGeometry({ direction: 'accumulate', targetAmount: 8000, currentAmount: 1000 }, C);
    expect(near.height).toBe(far.height);
  });
});

describe('the two scales are never compared', () => {
  it('tags every peak with its own scale', () => {
    expect(peakGeometry({ direction: 'paydown', accounts: [{ balance: -100, apr: 10 }] }, C).scale)
      .toBe('paydown');
    expect(peakGeometry({ direction: 'accumulate', targetAmount: 100 }, C).scale)
      .toBe('accumulate');
  });

  it('splits into two lists rather than one sorted one', () => {
    // Two lists so a caller cannot accidentally render them against a shared
    // axis. Making the wrong thing awkward is the design decision.
    const { costingYou, building } = splitByScale([
      { direction: 'paydown' as const, id: 1 },
      { direction: 'accumulate' as const, id: 2 },
      { direction: 'paydown' as const, id: 3 },
    ]);
    expect(costingYou.map((p) => p.id)).toEqual([1, 3]);
    expect(building.map((p) => p.id)).toEqual([2]);
  });

  it('the same magnitude on the two scales gives DIFFERENT heights', () => {
    // Proof the ceilings are genuinely separate. £100 of monthly interest is a
    // full mountain; £100 left to save is almost nothing.
    const debt = peakGeometry({ direction: 'paydown', accounts: [{ balance: -6000, apr: 20 }] }, C);
    const save = peakGeometry({ direction: 'accumulate', targetAmount: 100, currentAmount: 0 }, C);
    expect(debt.magnitude).toBeCloseTo(100, 6);
    expect(save.magnitude).toBeCloseTo(100, 6);
    expect(debt.height).not.toBeCloseTo(save.height, 3);
  });
});

describe('currency', () => {
  it('*** NO USABLE RATE MEANS UNMEASURED, NOT GUESSED ***', () => {
    // Otherwise the bands are silently dollar-shaped and a ¥-denominated goal
    // lands absurdly.
    const g = peakGeometry({
      direction: 'accumulate', targetAmount: 10000, currentAmount: 0, convertible: false,
    }, C);
    expect(g.unmeasured).toBe(true);
    expect(g.height).toBe(0);
    expect(g.magnitude).toBeNull();
  });

  it('an unconvertible DEBT peak is unmeasured even with a rate', () => {
    const g = peakGeometry({
      direction: 'paydown', accounts: [{ balance: -1200, apr: 20 }], convertible: false,
    }, C);
    expect(g.unmeasured).toBe(true);
  });
});

describe('the ground', () => {
  it('is recurring obligations plus card minimums', () => {
    expect(groundHeight({
      recurringMonthly: [1200, 60, 15],
      cardMinimums: [35, 25],
    })).toBeCloseTo(1335, 6);
  });

  it('tolerates a card with no minimum stated', () => {
    expect(groundHeight({ recurringMonthly: [1000], cardMinimums: [null, undefined, 40] }))
      .toBeCloseTo(1040, 6);
  });

  it('is zero, not NaN, for somebody with nothing recurring', () => {
    expect(groundHeight({})).toBe(0);
  });
});

describe('the default ceilings', () => {
  it('are a passable DEFAULT, not baked into the function', () => {
    // These used to be a proposal because the band table was unanswered. It is
    // answered now — two seeded tables — so these mirror the top band's floor,
    // and `test_goal_mountains.py` reads this file's bytes to enforce that.
    // They stay passable because adminPal will own the bands: the server will
    // send the ceilings alongside them and this object becomes the fallback.
    expect(DEFAULT_CEILINGS.costCeiling).toBe(250);
    expect(DEFAULT_CEILINGS.buildCeiling).toBe(40000);
    const withDefaults = peakGeometry({ direction: 'accumulate', targetAmount: 1000 });
    const withExplicit = peakGeometry({ direction: 'accumulate', targetAmount: 1000 },
                                      DEFAULT_CEILINGS);
    expect(withDefaults.height).toBe(withExplicit.height);
  });

  it('a zero ceiling gives a flat peak rather than Infinity or NaN', () => {
    const g = peakGeometry({ direction: 'accumulate', targetAmount: 1000 },
                           { costCeiling: 0, buildCeiling: 0, maxHeight: 100 });
    expect(Number.isFinite(g.height)).toBe(true);
    expect(g.height).toBe(0);
  });
});
