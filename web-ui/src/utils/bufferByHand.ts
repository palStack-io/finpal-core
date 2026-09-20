/**
 * An emergency-fund target from figures the USER types, not ones finPal read.
 *
 * *** THIS IS NOT finPal INVENTING A NUMBER, AND THE DISTINCTION IS THE WHOLE
 * DESIGN. *** Everywhere else this codebase refuses to state a figure it
 * cannot compute — four coin payoffs were caught bluffing on 2026-09-14 and
 * `buffer_picture` returns `None` rather than a zero target. A figure the
 * reader typed is different in kind: it is THEIR claim about their own money,
 * the same standing `Goal.current_manual` has ("a manual goal, whose current
 * figure is typed rather than computed"). What must never happen is the typed
 * figure being presented as something finPal measured, which is why the
 * caller shows both and labels this one.
 *
 * *** IT EXISTS BECAUSE THE MEASURED PATH FAILS EXACTLY THE PEOPLE WHO NEED
 * IT MOST. *** `_essential_monthly_spend` reads categories sorted as Fixed.
 * Somebody who has just arrived has sorted nothing, so finPal says nothing —
 * and "I have no buffer and no idea how big one should be" is the state the
 * whole feature is for.
 *
 * *** BYTE-IDENTICAL IN `web-ui/src/utils/` AND `mobile/src/utils/`. *** Two
 * clients doing one arithmetic two ways is D-101. A test diffs the files.
 */

/** The conventional options, offered as options. finPal picks neither. */
export const MONTH_OPTIONS = [3, 6] as const;

export interface ByHandTarget {
  months: number;
  target: number;
}

export interface ByHandPicture {
  /** months × fixed. The pot. */
  targets: ByHandTarget[];
  /**
   * `income - fixed`, or `null` when no income was given.
   *
   * *** NOT A RECOMMENDATION, AND NOT CLAMPED. *** A negative figure means
   * the fixed costs they typed exceed the income they typed, which is a fact
   * worth seeing rather than a zero to hide behind. finPal states it; it does
   * not tell anybody what share of it to save.
   */
  spare: number | null;
  /**
   * Months to reach the 6-month target at HALF of `spare`, or `null`.
   *
   * *** HALF, AND THE CALLER MUST SAY SO. *** Putting every spare pound at a
   * buffer is not a plan anybody keeps, and finPal has no basis for choosing
   * a rate — so this is an illustration with its assumption named, not a
   * recommendation. `null` when there is nothing spare: "you will get there
   * in ∞ months" is not a sentence worth printing.
   */
  monthsAtHalfSpare: number | null;
}

/**
 * `null` when there is nothing to work with.
 *
 * Fixed costs are the only required figure — the target is months × fixed.
 * Income is optional and buys the second half of the answer.
 */
export const bufferByHand = (
  fixedMonthly: number | null,
  incomeMonthly: number | null,
): ByHandPicture | null => {
  if (fixedMonthly === null || !Number.isFinite(fixedMonthly) || fixedMonthly <= 0) {
    return null;
  }

  const targets = MONTH_OPTIONS.map((months) => ({
    months,
    target: Math.round(fixedMonthly * months * 100) / 100,
  }));

  const hasIncome = incomeMonthly !== null
    && Number.isFinite(incomeMonthly) && incomeMonthly > 0;
  const spare = hasIncome
    ? Math.round((incomeMonthly - fixedMonthly) * 100) / 100
    : null;

  const sixMonth = targets[targets.length - 1].target;
  const rate = spare !== null && spare > 0 ? spare / 2 : null;
  const monthsAtHalfSpare = rate === null ? null : Math.ceil(sixMonth / rate);

  return { targets, spare, monthsAtHalfSpare };
};
