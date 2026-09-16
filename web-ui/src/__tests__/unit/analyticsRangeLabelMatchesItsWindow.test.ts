/**
 * Every range label on Analytics names the window the page actually queries.
 *
 * *** IT SAID "THIS MONTH" OVER A ROLLING 30 DAYS. *** `windowsFor` subtracts
 * a day count from today — 7, 30 or 365 — on purpose, so that a range is
 * compared against an equal-length range before it rather than against a full
 * calendar month it is four days into. Two of the three labels already said so
 * ("Last 7 days", "Last 12 months"); the middle one claimed a calendar month.
 *
 * Measured on the live demo: the card read "Spending by Category · This month"
 * over $3,159.36, while September's spending is $2,359.72 and August's is
 * $2,892.52. The window spans mid-August to mid-September and belongs to
 * neither — so the dashboard and Analytics put two different totals under one
 * month's name. That is D-206's consequence (one figure, two names) and
 * D-102's shape (a caption is not covered by the chart's geometry tests).
 *
 * This is a source assertion rather than a render test because the defect is a
 * disagreement between two constants in the same file, and that is exactly
 * what a render test would have to be told about to notice.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(
  join(__dirname, '..', '..', 'pages', 'Analytics.tsx'), 'utf8');

describe('the range label and the range it queries', () => {
  it('the window is a rolling day count, which is what the labels must say', () => {
    // If this ever becomes calendar-aligned, the labels below are wrong in the
    // other direction and this test should fail rather than pass quietly.
    expect(SRC).toMatch(/const days = range === 'week' \? 7 : range === 'year' \? 365 : 30;/);
    expect(SRC).toContain('currentStart.setDate(now.getDate() - days)');
  });

  it.each([
    ['week', 'Last 7 days'],
    ['year', 'Last 12 months'],
  ])('%s is labelled %s', (_range, label) => {
    expect(SRC).toContain(`'${label}'`);
  });

  it('*** THE 30-DAY RANGE IS NOT CALLED "THIS MONTH" ***', () => {
    expect(SRC).toContain("'Last 30 days'");
    // The whole defect in one assertion: a rolling window must not borrow a
    // calendar month's name, because the dashboard shows the calendar month
    // and the two figures do not match.
    expect(SRC).not.toMatch(/rangeLabel = [^;]*'This month'/);
  });
});
