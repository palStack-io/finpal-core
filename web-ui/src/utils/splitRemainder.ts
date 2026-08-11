/**
 * How much of a transaction is still unallocated across its category splits.
 *
 * *** A DELIBERATE MIRROR OF `mobile/src/utils/splitRemainder.ts`, INCLUDING THE TOLERANCE. ***
 * The two clients are separate packages with no shared code, so this is duplicated rather than
 * imported — but the tolerance is **the server's** (the API refuses splits that do not add up to
 * within 0.01), so the two copies must not drift. If one changes, change both: a client that
 * calls 0.005 "fully split" promises a save the server rejects.
 *
 * Pure on purpose. The form renders the number and validates against it, and those two must be
 * the same calculation — a line reading "Fully split" above a form that then refuses to submit
 * is worse than showing nothing.
 */

/** The server's tolerance for "these add up". Do not tighten without checking the API. */
export const SPLIT_TOLERANCE = 0.01;

export interface SplitRemainder {
  /** Signed: positive means unallocated, negative means over-allocated. */
  remainder: number;
  /** The parsed sum of the rows, ignoring blanks and junk. */
  total: number;
  /** Within tolerance of zero — the only state the server will accept. */
  isBalanced: boolean;
  /** More allocated than the transaction is worth. */
  isOver: boolean;
  /**
   * Whether a remainder is worth showing. False before there is an amount or a row: the whole
   * transaction total, shown before the user has begun splitting, is noise rather than help.
   */
  shouldShow: boolean;
}

const parse = (value: string | number | null | undefined): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

export const splitRemainder = (
  amount: string | number | null | undefined,
  rows: Array<{ amount: string | number | null | undefined }>,
): SplitRemainder => {
  const parsedAmount = parse(amount);
  const total = rows.reduce((sum, row) => sum + parse(row.amount), 0);
  const remainder = parsedAmount - total;

  return {
    remainder,
    total,
    isBalanced: Math.abs(remainder) <= SPLIT_TOLERANCE,
    isOver: remainder < -SPLIT_TOLERANCE,
    shouldShow: parsedAmount > 0 && rows.length > 0,
  };
};

/**
 * The index of the row an "assign the rest" click should fill: the LAST row with no amount.
 *
 * `-1` when every row already holds a number, which is what stops the control overwriting a
 * value the user typed — the one behaviour that would make this harmful rather than unhelpful.
 */
export const rowForRemainder = (
  rows: Array<{ amount: string | number | null | undefined }>,
): number => {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const raw = rows[i]?.amount;
    const empty = raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
    if (empty) return i;
  }
  return -1;
};
