/**
 * Month keys (`'2026-09'`) and the one way to turn them into a date.
 *
 * *** `new Date('2026-09-01')` IS NOT SEPTEMBER. *** A date-ONLY string is
 * parsed as UTC midnight by the ECMAScript spec, so west of UTC it lands in the
 * previous month and `toLocaleDateString` names that month. Measured in
 * America/Denver:
 *
 *     new Date('2026-09-01')          -> "August 2026"      wrong
 *     new Date('2026-09-01T00:00:00') -> "September 2026"   right
 *
 * That is D-206. On the dashboard it showed as the same figure being called two
 * different things on one screen: the strip said "$2,359.72 went out this
 * month" and the breakdown below called the identical total "August 2026".
 *
 * *** A DATE-TIME STRING WITHOUT AN OFFSET IS PARSED AS LOCAL, AND THAT IS WHY
 * TRANSACTION DATES WERE NEVER AFFECTED. *** The API sends
 * `'2026-09-11T00:00:00'` for a transaction, which is already local and renders
 * correctly — checked before assuming the bug was everywhere, because the
 * obvious sweep would have "fixed" a dozen correct call sites.
 *
 * So the rule this module exists to hold: **anything built from a `YYYY-MM`
 * key goes through here**, and nothing else needs to change.
 */

/** A `YYYY-MM` key, as the API groups by. */
export type MonthKey = string;

/**
 * The first day of that month, in the reader's own timezone.
 *
 * The `T00:00:00` is the whole fix and it is easy to delete by accident, which
 * is why this is a function and not a line repeated at each call site.
 */
export const startOfMonth = (key: MonthKey): Date => new Date(`${key}-01T00:00:00`);

/** e.g. `"September 2026"` — the breakdown's heading. */
export const monthLabelLong = (key: MonthKey): string =>
  startOfMonth(key).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

/** e.g. `"Sep 26"` — a chart axis, where the long form will not fit. */
export const monthLabelShort = (key: MonthKey): string =>
  startOfMonth(key).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

/** Is this key the month the reader is in right now? */
export const isCurrentMonth = (key: MonthKey): boolean => {
  const now = new Date();
  const start = startOfMonth(key);
  return start.getFullYear() === now.getFullYear() && start.getMonth() === now.getMonth();
};
