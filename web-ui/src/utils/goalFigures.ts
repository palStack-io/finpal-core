import type { Goal } from '../types/goal';

/**
 * The one line under a goal's progress bar that says where the money is (D-179).
 *
 * *** "X of Y" IS WRITTEN FOR AN ACCUMULATION AND WAS BEING REUSED FOR A PAYDOWN,
 * WHICH IS HOW A PAYOFF GOAL CAME TO READ "−$800.00 of $0.00". *** Every figure in
 * that sentence was correct — the card owes $800, the target is to owe $0, and the
 * 52% beside it is the server's own number — and the sentence still described
 * nothing a reader recognises. "X of Y" means *"X so far, out of Y wanted"*, which
 * is exactly right for `$650.00 of $2,000.00` and meaningless when X is a debt and
 * Y is zero.
 *
 * This is D-102's shape without D-102's error: there the caption disagreed with the
 * geometry and was *wrong*; here it agreed with everything and was *unreadable*.
 * Both come from one presentation being written for one direction and reused for
 * the other, and `direction` is on the payload, so the client can always tell.
 *
 * *** THE SAME FUNCTION EXISTS IN mobile AT `src/utils/goalFigures.ts`, AND THE TWO
 * TEST FILES PIN THE SAME CASE TABLE ON PURPOSE. *** They are separate git repos,
 * so there is no shared module to import; what there can be is one table of inputs
 * and expected strings, written identically in both, so a divergence shows up as a
 * diff rather than as a user noticing that the phone and the web app describe one
 * goal two different ways. D-99's lesson applied to copy: fixing a presentation on
 * one client is not fixing it.
 *
 * *** IT DELIBERATELY DOES NOT LIVE ON THE SERVER. *** A `*_formatted` key is how a
 * payload field becomes a lie (D-05): the server would have to pick a locale and a
 * currency format for two clients that already have their own, and the numbers it
 * already sends are enough to derive this.
 */

/** What the caller renders. `separator` is null when there is nothing to compare to. */
export interface GoalFigures {
  /** e.g. `$800.00`, or `Paid off`. */
  primary: string;
  /** e.g. `left of`, `of` — null when `primary` says it all. */
  separator: string | null;
  /** e.g. `$1,650.00` — null when `separator` is. */
  secondary: string | null;
}

type MoneyFormatter = (amount: number) => string;

export function goalFigures(goal: Goal, money: MoneyFormatter): GoalFigures {
  if (goal.direction === 'accumulate') {
    // Unchanged, and correct: money put aside, out of the money wanted.
    return {
      primary: money(goal.current_amount),
      separator: 'of',
      secondary: money(goal.target_amount),
    };
  }

  /*
   * Paydown. Both quantities are stated in the direction the user is thinking in —
   * how much is LEFT, out of how much there was to clear — so both are positive and
   * neither is a negative balance the reader has to reinterpret.
   *
   * No `Math.abs`, deliberately. Card debt is a negative balance, so for a payoff
   * goal `target` is above `current` and above `start`, and both subtractions come
   * out positive on their own. Reaching for `abs` is what turned an overpaid card
   * into a $4,800 available-credit figure that should have read $5,200 (D-176) — it
   * hides the sign instead of respecting it, and the sign is the information.
   */
  const remaining = goal.target_amount - goal.current_amount;
  const total = goal.target_amount - goal.start_amount;

  // Overshoot. The server leaves `progress` unclamped because going past the target
  // is real information; here it means the debt is gone, and "-$200.00 left" would
  // be a new nonsense in place of the old one.
  if (remaining <= 0) {
    return { primary: 'Paid off', separator: null, secondary: null };
  }

  return {
    primary: money(remaining),
    separator: 'left of',
    secondary: money(total),
  };
}
