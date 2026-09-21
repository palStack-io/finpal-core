import { describe, it, expect } from 'vitest';
import { holdingTotals, valueSplit, lastPriceUpdate } from '../../utils/holdingTotals';

/**
 * *** THE FIXTURE IS THE LIVE DEMO PAYLOAD, AND ONLY ITS UNCHANGING HALF IS PINNED. ***
 *
 * `GET /api/v1/investments/holdings` for `demo1@finpal.demo`, read 2026-09-15.
 * `cost_basis` is `shares * purchase_price` and never moves; `current_value` is
 * `shares * current_price` and moves on every price refresh — it was already
 * $6,185.20 when the mockup was drawn and $6,187.88 twenty minutes later.
 *
 * So the assertions below pin the RELATIONSHIPS (the gain is the difference,
 * the percentage comes from the totals, the split sums to 100) and the one
 * figure that cannot drift, `cost_basis`. Pinning a refreshing price is D-165:
 * a fixture that cannot produce the real case, and a test that goes red on
 * Tuesday for no reason anybody will remember.
 */
const DEMO = [
  { symbol: 'VTI', shares: 12, cost_basis: 2620.8, current_value: 4474.08, gain_loss: 1853.28 },
  { symbol: 'VXUS', shares: 20, cost_basis: 1162.0, current_value: 1713.8, gain_loss: 551.8 },
];

describe('the portfolio totals add up the server’s figures', () => {
  it('sums cost_basis to the figure that cannot drift', () => {
    expect(holdingTotals(DEMO).youPutIn).toBeCloseTo(3782.8, 2);
  });

  it('sums current_value and gain_loss as sent, without re-deriving either', () => {
    const t = holdingTotals(DEMO);
    expect(t.worthNow).toBeCloseTo(6187.88, 2);
    expect(t.gain).toBeCloseTo(2405.08, 2);
  });

  it('keeps the server’s gain reconcilable with its own value and cost', () => {
    // Deliberately NOT how `gain` is computed — that is the point. If the
    // server ever sends three figures that disagree, this is what shows it.
    const t = holdingTotals(DEMO);
    expect(t.gain).toBeCloseTo(t.worthNow - t.youPutIn, 2);
  });

  it('derives the percentage from the totals, not from the mean of the rows', () => {
    const t = holdingTotals(DEMO);
    // 2405.08 / 3782.80 = 63.58%. The mean of 70.71% and 47.49% is 59.10%,
    // which weights a $1,162 holding the same as a $2,621 one.
    expect(t.gainPercent).toBeCloseTo(63.5794, 3);
    const mean = (70.71428571428571 + 47.48709122203098) / 2;
    expect(t.gainPercent).not.toBeCloseTo(mean, 1);
  });
});

describe('it refuses rather than guessing', () => {
  it('returns null for the percentage when nothing was put in, NOT zero', () => {
    // 0% reads as "flat", which is a different and false claim from "there is
    // no percentage to show".
    const t = holdingTotals([
      { symbol: 'GIFT', cost_basis: 0, current_value: 500, gain_loss: 500 },
    ]);
    expect(t.gainPercent).toBeNull();
    expect(t.gainPercent).not.toBe(0);
  });

  it('excludes a holding with an unreadable figure WHOLE and names it', () => {
    const t = holdingTotals([
      DEMO[0],
      { symbol: 'BROKEN', cost_basis: 100 } as never, // no current_value, no gain_loss
    ]);
    expect(t.unreadable).toEqual(['BROKEN']);
    // Not partly counted: its cost_basis must not have reached the total.
    expect(t.youPutIn).toBeCloseTo(2620.8, 2);
  });

  it('never back-fills a missing value from shares * price', () => {
    // The row carries everything needed to reconstruct 100 * 3 = 300, and the
    // helper must still refuse — a reconstructed figure is indistinguishable on
    // screen from one the server stands behind.
    const t = holdingTotals([
      { symbol: 'CALC', shares: 3, cost_basis: 250 } as never,
    ]);
    expect(t.worthNow).toBe(0);
    expect(t.unreadable).toEqual(['CALC']);
  });

  it('reports an unreadable row even when it has no symbol', () => {
    const t = holdingTotals([{ cost_basis: 5 } as never]);
    expect(t.unreadable).toEqual(['an unnamed holding']);
  });

  it('treats a non-finite figure as unreadable, not as a number', () => {
    // NaN passes `typeof === 'number'`; Number.isFinite is what catches it.
    const t = holdingTotals([
      { symbol: 'NAN', cost_basis: NaN, current_value: 10, gain_loss: 10 },
    ]);
    expect(t.unreadable).toEqual(['NAN']);
    expect(t.worthNow).toBe(0);
  });
});

describe('where the value sits', () => {
  it('splits by current_value, largest first, summing to 100', () => {
    const segs = valueSplit(DEMO);
    expect(segs.map((s) => s.symbol)).toEqual(['VTI', 'VXUS']);
    expect(segs[0].share).toBeCloseTo(72.3, 1);
    expect(segs[1].share).toBeCloseTo(27.7, 1);
    expect(segs.reduce((n, s) => n + s.share, 0)).toBeCloseTo(100, 6);
  });

  it('returns nothing rather than dividing by zero on a worthless portfolio', () => {
    expect(valueSplit([
      { symbol: 'Z', cost_basis: 10, current_value: 0, gain_loss: -10 },
    ])).toEqual([]);
  });

  it('describes the same holdings the totals counted', () => {
    const rows = [DEMO[0], { symbol: 'BROKEN', cost_basis: 1 } as never];
    // One readable holding, so it is the whole bar — the refused row must not
    // appear in the split while being excluded from the total above it.
    expect(valueSplit(rows).map((s) => s.symbol)).toEqual(['VTI']);
    expect(holdingTotals(rows).unreadable).toEqual(['BROKEN']);
  });

  it('is empty for no holdings at all', () => {
    expect(valueSplit([])).toEqual([]);
  });
});

describe('how old the prices are', () => {
  it('reads a suffix-less timestamp as UTC, not as local time', () => {
    // The live payload's shape, verified 2026-09-15. Without the appended `Z`
    // this parses as local and lands hours in the FUTURE west of UTC.
    const d = lastPriceUpdate([{ last_update: '2026-09-16T04:09:22.458182' }]);
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-09-16T04:09:22.458Z');
  });

  it('does not shift a timestamp that already carries a zone', () => {
    const d = lastPriceUpdate([{ last_update: '2026-09-16T04:09:22Z' }]);
    expect(d!.toISOString()).toBe('2026-09-16T04:09:22.000Z');
    const off = lastPriceUpdate([{ last_update: '2026-09-16T04:09:22+02:00' }]);
    expect(off!.toISOString()).toBe('2026-09-16T02:09:22.000Z');
  });

  it('returns the newest update across holdings', () => {
    const d = lastPriceUpdate([
      { last_update: '2026-09-16T04:09:22' },
      { last_update: '2026-09-16T04:09:25' },
      { last_update: '2026-09-15T01:00:00' },
    ]);
    expect(d!.toISOString()).toBe('2026-09-16T04:09:25.000Z');
  });

  it('returns null rather than a wrong date when nothing has an update', () => {
    expect(lastPriceUpdate([])).toBeNull();
    expect(lastPriceUpdate([{}])).toBeNull();
    expect(lastPriceUpdate([{ last_update: '' }])).toBeNull();
  });

  it('skips an unparseable timestamp instead of rendering Invalid Date', () => {
    expect(lastPriceUpdate([{ last_update: 'not a date' }])).toBeNull();
    // and a good one alongside a bad one still resolves
    const d = lastPriceUpdate([{ last_update: 'nope' }, { last_update: '2026-09-16T04:00:00' }]);
    expect(d!.toISOString()).toBe('2026-09-16T04:00:00.000Z');
  });
});
