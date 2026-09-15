/**
 * What a recurring row costs per month.
 *
 * *** THIS IS THE PIECE `groundHeight()` HAS BEEN WAITING FOR. ***
 * `mountainGeometry.ts` takes `recurringMonthly: number[]` — amounts ALREADY
 * normalised to a month — and until now nothing in the app produced them:
 * `groundHeight` had a test file and **no production caller at all**, which is
 * D-187's shape (a route is not proof anything calls it) and D-106's (a
 * helper's own test is not adoption). So this file is deliberately not a second
 * sum; it converts, and the existing helper still does the adding.
 *
 * *** AN UNRECOGNISED FREQUENCY RETURNS null, AND IS NOT TREATED AS MONTHLY. ***
 * `recurring.frequency` is a `String(20)` with no database constraint and a
 * comment naming four values, so a fifth can exist. Defaulting it to "monthly"
 * would silently understate a yearly bill by 12x or overstate a daily one by
 * 30x inside a figure the user reads as their fixed cost. The only permitted
 * denominator is one that is true (§6: never invent a figure), so the caller is
 * made to decide what to say instead.
 */

/** The frequencies `src/models/recurring.py` documents. */
export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * Multipliers, and why these and not "4 weeks in a month":
 *
 *   weekly  x 52/12 = 4.3333…  — 52 weeks a year, not 48. Using 4 loses a
 *                                whole week's payment every three months, and
 *                                on the demo's £15 shop that is £60 a year
 *                                missing from the ground.
 *   daily   x 365/12 = 30.4166… — not 30, for the same reason.
 *   yearly  / 12
 *
 * Leap years are ignored on purpose: 0.07% on a daily row is far below the
 * rounding the figure is displayed at, and pretending otherwise would imply a
 * precision the input does not have.
 */
const PER_MONTH: Record<RecurringFrequency, number> = {
  daily: 365 / 12,
  weekly: 52 / 12,
  monthly: 1,
  yearly: 1 / 12,
};

/**
 * `amount` at `frequency`, expressed per month. `null` when the frequency is
 * not one finPal knows how to convert — see the note above.
 */
export function monthlyEquivalent(
  amount: number | null | undefined,
  frequency: string | null | undefined,
): number | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  const key = (frequency || '').trim().toLowerCase();
  const multiplier = PER_MONTH[key as RecurringFrequency];
  if (multiplier === undefined) return null;
  // A recurring row's amount is stored unsigned; the sign lives in
  // `transaction_type`. `Math.abs` here would hide a negative that should be
  // questioned, so the caller's own figure is preserved.
  return amount * multiplier;
}

/** True when finPal can put a monthly figure on this row at all. */
export function isConvertible(frequency: string | null | undefined): boolean {
  return PER_MONTH[(frequency || '').trim().toLowerCase() as RecurringFrequency] !== undefined;
}

/**
 * How it reads next to the row's own amount: "$65.00 / mo". Returned as null
 * rather than as a dash so the caller chooses the words for "cannot say".
 */
export function monthlyLabel(
  amount: number | null | undefined,
  frequency: string | null | undefined,
  format: (n: number) => string,
): string | null {
  const monthly = monthlyEquivalent(amount, frequency);
  return monthly === null ? null : `${format(monthly)} / mo`;
}
