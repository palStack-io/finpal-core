/**
 * The emergency-fund target from figures the user typed.
 *
 * *** THE CASE TABLE IS DUPLICATED VERBATIM IN
 * `mobile/src/__tests__/bufferByHand.test.ts`. *** The two clients are
 * separate git repos with no shared module, and one arithmetic done two ways
 * is D-101. `goalFigures.test.ts` records the same arrangement and the same
 * reason: if you change a number here, change it there in the same turn.
 */
import { describe, expect, it } from 'vitest';
import { bufferByHand, MONTH_OPTIONS } from '../../utils/bufferByHand';

describe('a buffer worked out by hand', () => {
  it('needs fixed costs and returns null without them', () => {
    /* *** NULL, NOT A ZERO TARGET. *** The same fail-closed rule
       `buffer_picture` follows: "you need $0.00" is a sentence finPal cannot
       justify, and here it would also be one the USER did not say. */
    expect(bufferByHand(null, 4200)).toBeNull();
    expect(bufferByHand(0, 4200)).toBeNull();
    expect(bufferByHand(-50, 4200)).toBeNull();
    expect(bufferByHand(Number.NaN, 4200)).toBeNull();
  });

  it('works from fixed costs ALONE — income is optional', () => {
    /* The target is months × fixed. Income buys the second half of the
       answer and must not be required for the first. */
    const picture = bufferByHand(2050, null);
    expect(picture?.targets).toEqual([
      { months: 3, target: 6150 },
      { months: 6, target: 12300 },
    ]);
    expect(picture?.spare).toBeNull();
    expect(picture?.monthsAtHalfSpare).toBeNull();
  });

  it('offers three months and six, and picks neither', () => {
    /* Which is right depends on job security, dependants and health, none of
       which finPal knows — the same line `buffer_picture` walks. */
    expect([...MONTH_OPTIONS]).toEqual([3, 6]);
    expect(bufferByHand(1000, null)?.targets).toHaveLength(2);
  });

  it('states what is spare, and how long HALF of it takes', () => {
    /* 4,200 − 2,050 = 2,150 spare. Half is 1,075. The six-month target is
       12,300, so 12,300 / 1,075 = 11.44 → 12 months, rounded UP. */
    const picture = bufferByHand(2050, 4200);
    expect(picture?.spare).toBe(2150);
    expect(picture?.monthsAtHalfSpare).toBe(12);
  });

  it('rounds the months UP, never down', () => {
    /* A month rounded down is a plan that arrives late, and a plan that
       quietly misses is worse than one that asks for a little longer — the
       same rule `monthly_contribution` and the sinking twelfth follow. */
    // fixed 100 -> six-month target 600; income 300 -> spare 200, half 100.
    // 600 / 100 = 6 exactly, so this one must NOT be inflated to 7.
    expect(bufferByHand(100, 300)?.monthsAtHalfSpare).toBe(6);
    // fixed 100, income 281 -> spare 181, half 90.5; 600 / 90.5 = 6.63 -> 7.
    expect(bufferByHand(100, 281)?.monthsAtHalfSpare).toBe(7);
  });

  it('reports a NEGATIVE spare rather than hiding it behind a zero', () => {
    /* *** FIXED COSTS ABOVE INCOME IS A FACT WORTH SEEING. *** Clamping it
       to zero would turn "you are 300 short every month" into "you have
       nothing spare", which are different sentences about different
       situations. Not clamped, for the same reason `short_by` is not. */
    const picture = bufferByHand(2500, 2200);
    expect(picture?.spare).toBe(-300);
    /* And there is no arrival date, because there is nothing to save. */
    expect(picture?.monthsAtHalfSpare).toBeNull();
  });

  it('gives no arrival date when income exactly covers fixed costs', () => {
    expect(bufferByHand(2000, 2000)?.spare).toBe(0);
    expect(bufferByHand(2000, 2000)?.monthsAtHalfSpare).toBeNull();
  });

  it('ignores a zero or nonsense income rather than treating it as a figure', () => {
    expect(bufferByHand(2050, 0)?.spare).toBeNull();
    expect(bufferByHand(2050, Number.NaN)?.spare).toBeNull();
  });
});
