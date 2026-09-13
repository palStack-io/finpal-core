/**
 * The Review page's date, pinned to what the SERVER actually sends.
 *
 * *** THE STRING IN THESE TESTS WAS CAPTURED FROM THE LIVE DEMO, NOT INVENTED. ***
 *
 *     GET /api/v1/review -> "date": "2026-09-01T07:46:39.847799"
 *
 * `Expense.date` is a `DateTime`, so `isoformat()` carries the time and six
 * digits of microseconds. The page shipped rendering that raw for one deploy —
 * seven digits of precision on a row asking *"what did you spend this on?"* —
 * and neither the type (`string | null`) nor the walk fixture (which carried a
 * comfortable bare `'2026-09-09'`) could see it.
 *
 * That is this project's oldest recurring failure in a new place: **an interface
 * is a claim about a server, not a check of one.** `analyticsService.ts` invented
 * an analytics payload five separate times and every one typechecked green.
 */
import { describe, expect, it } from 'vitest';

import { formatRowDate } from '../../pages/Review';

/** Verbatim from the deployed demo on 2026-09-13. */
const LIVE = '2026-09-01T07:46:39.847799';

describe('the review row date', () => {
  it('shows no time, and above all no microseconds', () => {
    const out = formatRowDate(LIVE);

    expect(out).not.toContain('T');
    expect(out).not.toContain(':');
    expect(out, 'the microseconds are when the importer ran, not when you spent')
      .not.toContain('847799');
  });

  it('still names the day the money moved', () => {
    // The point of formatting is to drop the noise, NOT the information. A
    // formatter that returned "September" would pass every assertion above.
    const out = formatRowDate(LIVE);

    expect(out).toContain('1');
    expect(out).toContain('2026');
  });

  it('renders a bare date too, since the API is free to send one', () => {
    const out = formatRowDate('2026-09-09');

    expect(out).not.toContain('T');
    expect(out).toContain('2026');
  });

  it('returns an unparseable value unchanged rather than "Invalid Date"', () => {
    // *** RENDERING `Invalid Date` OVER A REAL VALUE IS WORSE THAN RENDERING
    // THE VALUE. *** The user can read an ISO string; they cannot read a
    // formatter's error, and they have no way to tell it is ours rather than
    // something wrong with their data.
    expect(formatRowDate('not a date')).toBe('not a date');
  });

  it('renders nothing for a missing date', () => {
    // The column is nullable, and the row is still worth showing without it.
    expect(formatRowDate(null)).toBe('');
  });
});
