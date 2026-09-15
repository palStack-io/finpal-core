/**
 * *** A TEST FOR THIS THAT RUNS IN UTC PASSES WITH THE BUG PRESENT. ***
 *
 * D-206: `new Date('2026-09-01')` is parsed as UTC midnight, so anywhere west
 * of UTC it is 31 August and `toLocaleDateString` names the wrong month. In UTC
 * itself it is correct, which is exactly why this shipped and why the timezone
 * is pinned here rather than inherited from whoever runs the suite.
 *
 * It showed on the dashboard as one figure with two names on one screen: the
 * strip said "$2,359.72 went out this month" and the breakdown below called the
 * identical total "August 2026".
 *
 * *** THE NEGATIVE CONTROL MATTERS AS MUCH AS THE ASSERTION. *** The obvious
 * sweep — "replace every `new Date(x)` on a date string" — would have touched a
 * dozen correct call sites, because a date-TIME string with no offset is parsed
 * as LOCAL. Transaction dates arrive as `'2026-09-11T00:00:00'` and have always
 * rendered correctly. `the raw shape is what is broken` pins that distinction so
 * nobody "fixes" the half that works.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { monthLabelLong, monthLabelShort, startOfMonth, isCurrentMonth } from '../../utils/monthKeys';

const REAL_TZ = process.env.TZ;

describe('month keys, in a timezone west of UTC', () => {
  // America/Denver is UTC-6/-7 — the case the reporter is in, and the case a
  // UTC-run suite cannot see.
  beforeAll(() => { process.env.TZ = 'America/Denver'; });
  afterAll(() => { process.env.TZ = REAL_TZ; });

  it('the raw shape is what is broken, and it still is', () => {
    // Not a test of our code: a demonstration that the hazard is real in this
    // runtime, so the assertions below are about something rather than nothing.
    // If this ever stops being true, the helper can go.
    const naive = new Date('2026-09-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const naiveTime = new Date('2026-09-11T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    expect(naive).toBe('August 2026');        // date-only  -> UTC  -> wrong
    expect(naiveTime).toBe('Sep 11');         // date-time  -> local -> right
  });

  it('names the month the key names', () => {
    expect(monthLabelLong('2026-09')).toBe('September 2026');
    expect(monthLabelLong('2026-01')).toBe('January 2026');
    expect(monthLabelLong('2026-12')).toBe('December 2026');
  });

  it('names it the same way in the short form a chart axis uses', () => {
    expect(monthLabelShort('2026-09')).toBe('Sep 26');
    expect(monthLabelShort('2026-01')).toBe('Jan 26');
  });

  it('starts the month on its own first day, not the previous one', () => {
    const d = startOfMonth('2026-09');
    expect(d.getMonth()).toBe(8);   // 0-indexed September
    expect(d.getDate()).toBe(1);
    expect(d.getFullYear()).toBe(2026);
  });

  it('knows which key is the reader\'s current month', () => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    expect(isCurrentMonth(key)).toBe(true);
    expect(isCurrentMonth('2001-04')).toBe(false);
  });

  it('crosses a year boundary without losing the year', () => {
    // January is where an off-by-one month is also an off-by-one YEAR, which is
    // the version of this bug somebody would report as "it says 2025".
    expect(monthLabelLong('2026-01')).not.toContain('2025');
    expect(monthLabelShort('2026-01')).toBe('Jan 26');
  });
});
