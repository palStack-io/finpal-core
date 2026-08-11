/**
 * The split remainder on web — *"how much is left to split"*.
 *
 * Owner request, 2026-08-10. Web showed `Total split: $X / $Y` and left the subtraction to the
 * reader; there was no remainder and no live warning when the rows exceeded the amount.
 *
 * *** THIS FILE ALSO PINS THE MIRROR. *** `mobile/src/utils/splitRemainder.ts` is the same
 * function, duplicated because the two clients share no code. The tolerance is **the server's**
 * — the API refuses splits that do not add up to within 0.01 — so a drift between the copies
 * means one client promising a save the server rejects. The constant is asserted below so a
 * change here is deliberate rather than incidental.
 */
import { describe, it, expect } from 'vitest';

import { splitRemainder, rowForRemainder, SPLIT_TOLERANCE } from '../../utils/splitRemainder';

const rows = (...amounts: Array<string | null>) => amounts.map((amount) => ({ amount }));

describe('splitRemainder', () => {
  it('is the server tolerance, matching mobile', () => {
    expect(SPLIT_TOLERANCE).toBe(0.01);
  });

  it('reports what is left when the rows are short', () => {
    const r = splitRemainder('100', rows('30', '20'));
    expect(r.total).toBe(50);
    expect(r.remainder).toBe(50);
    expect(r.isBalanced).toBe(false);
    expect(r.isOver).toBe(false);
    expect(r.shouldShow).toBe(true);
  });

  it('is balanced when the rows add up exactly', () => {
    const r = splitRemainder('100', rows('60', '40'));
    expect(r.isBalanced).toBe(true);
    expect(r.isOver).toBe(false);
  });

  it('is over-allocated when the rows exceed the amount', () => {
    const r = splitRemainder('100', rows('80', '32.50'));
    expect(r.remainder).toBeCloseTo(-12.5, 2);
    expect(r.isOver).toBe(true);
  });

  it('treats a penny of float drift as balanced, matching the server', () => {
    // 0.1 + 0.2 is 0.30000000000000004; a stricter check would refuse what the API accepts.
    expect(splitRemainder('0.3', rows('0.1', '0.2')).isBalanced).toBe(true);
  });

  it('ignores blank and non-numeric rows rather than producing NaN', () => {
    // "$NaN left to split" is how a display bug becomes a support ticket, and an empty row is
    // the NORMAL state immediately after clicking "+ Add Category Split".
    const r = splitRemainder('100', rows('40', '', null, 'abc'));
    expect(r.total).toBe(40);
    expect(Number.isNaN(r.remainder)).toBe(false);
  });

  it('stays hidden before there is anything to describe', () => {
    expect(splitRemainder('', rows('10')).shouldShow).toBe(false);
    expect(splitRemainder('100', []).shouldShow).toBe(false);
    expect(splitRemainder('100', rows('')).shouldShow).toBe(true);
  });
});

describe('rowForRemainder', () => {
  it('picks the last empty row', () => {
    expect(rowForRemainder(rows('10', '', ''))).toBe(2);
  });

  it('refuses to pick a row that already has a value', () => {
    // Silently overwriting a typed number is the one outcome worse than no feature at all.
    expect(rowForRemainder(rows('10', '20'))).toBe(-1);
    expect(rowForRemainder([])).toBe(-1);
  });
});
