import { describe, it, expect } from 'vitest';
import { parseServerDate } from '../../utils/serverDate';

/**
 * *** THE TEST THAT MATTERS IS THE SMALL-HOURS ONE. ***
 * This API sends naive UTC, and JavaScript's default differs by whether the
 * string has a time in it — local for a date-time, UTC for a bare date. Both
 * defaults are wrong here, in opposite directions.
 *
 * The bug this file pins survived because the demo's own data cannot expose it:
 * `purchase_date` sits at 22:15 UTC, which is the same calendar day in Denver,
 * so the naive reading renders correctly. Only a timestamp in the UTC small
 * hours shows the defect. A fixture built from the demo alone would have gone
 * green over it — D-165's shape.
 */
describe('a naive date-TIME is UTC, not local', () => {
  it('parses the live payload’s shape as UTC', () => {
    // Read from the demo 2026-09-15, when the local clock said 22:09 on the
    // 15th. Read as local this is a refresh that has not happened yet.
    const d = parseServerDate('2026-09-16T04:09:22.458182');
    expect(d!.toISOString()).toBe('2026-09-16T04:09:22.458Z');
  });

  it('*** keeps the calendar day right for a small-hours UTC stamp ***', () => {
    // 02:00 UTC on the 15th is the 14th anywhere west of UTC-2. The old code
    // read this as local and reported the 15th.
    const d = parseServerDate('2026-01-15T02:00:00');
    expect(d!.toISOString()).toBe('2026-01-15T02:00:00.000Z');
    // Stated as an instant, so a formatter in a western zone renders the 14th.
    const denver = d!.toLocaleDateString('en-US', { timeZone: 'America/Denver' });
    expect(denver).toBe('1/14/2026');
  });

  it('is unchanged for a stamp whose UTC and local day agree', () => {
    // The demo's actual value. This is why the defect was invisible.
    const d = parseServerDate('2026-01-15T22:15:39.768484');
    expect(d!.toLocaleDateString('en-US', { timeZone: 'America/Denver' }))
      .toBe('1/15/2026');
  });

  it('believes an explicit zone rather than overriding it', () => {
    expect(parseServerDate('2026-09-16T04:09:22Z')!.toISOString())
      .toBe('2026-09-16T04:09:22.000Z');
    expect(parseServerDate('2026-09-16T04:09:22+02:00')!.toISOString())
      .toBe('2026-09-16T02:09:22.000Z');
    expect(parseServerDate('2026-09-16T04:09:22-0700')!.toISOString())
      .toBe('2026-09-16T11:09:22.000Z');
  });
});

describe('a bare date is a CALENDAR day, which is the opposite rule', () => {
  it('keeps a date-only value on the day it names — D-206', () => {
    // `new Date('2026-09-01')` is UTC midnight and reads as 31 August west of
    // UTC. "Bought on the 1st" means the 1st wherever the reader is.
    const d = parseServerDate('2026-09-01');
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(8); // September, zero-indexed
    expect(d!.getDate()).toBe(1);
  });

  it('does not apply the UTC rule to a bare date', () => {
    // The distinction is the whole point: appending `Z` here would re-create
    // D-206. A bare date must be LOCAL midnight.
    //
    // *** ASSERTED AS AN EQUALITY, NOT AS `not.toBe` THE UTC STRING. ***
    // This test previously read:
    //
    //     expect(local.toISOString()).not.toBe('2026-09-01T00:00:00.000Z');
    //
    // which can never pass in CI. GitHub Actions runs in UTC, and in UTC
    // local midnight IS UTC midnight — so `toISOString()` equals that string
    // and the negation fails. It passed on a developer machine at -0600 and
    // failed every CI run, blocking #196 from 2026-09-17.
    //
    // Comparing against a locally-constructed midnight asserts the real
    // invariant in every timezone, UTC included, and still catches the
    // `Z`-appending regression it was written for: if `parseServerDate`
    // appended `Z`, this would differ by the machine's offset everywhere
    // that offset is non-zero.
    const local = parseServerDate('2026-09-01')!;
    expect(local.getTime()).toBe(new Date(2026, 8, 1, 0, 0, 0, 0).getTime());
  });
});

describe('it returns null rather than an Invalid Date', () => {
  it('refuses empty and absent input', () => {
    expect(parseServerDate(null)).toBeNull();
    expect(parseServerDate(undefined)).toBeNull();
    expect(parseServerDate('')).toBeNull();
  });

  it('refuses unparseable input instead of returning something truthy', () => {
    // An Invalid Date is TRUTHY and formats as the literal "Invalid Date", so a
    // caller that forgets to check prints that to the user. null forces it.
    const bad = parseServerDate('not a date');
    expect(bad).toBeNull();
    expect(Boolean(new Date('not a date'))).toBe(true); // why null matters
  });
});
