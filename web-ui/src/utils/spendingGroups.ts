/**
 * Which of the three groups a category belongs to.
 *
 * *** THE SAME FILE EXISTS IN THE OTHER CLIENT AND THE TWO TEST FILES PIN THE SAME
 * CASE TABLE ON PURPOSE. *** web-ui and mobile are separate git repos with no
 * shared module, so there is nothing to import; what there can be is one table of
 * inputs and expected outputs written identically in both, so a divergence shows
 * up as a diff rather than as a user noticing the phone and the web app sort one
 * category two different ways. Fourth use of the convention, after `goalFigures`,
 * `goalTracking` and `mountainGeometry`. **Change one, change both, in the same
 * turn.** These two files are byte-identical; `diff` them.
 *
 * *** WHAT THIS IS FOR, AND WHAT IT MUST NOT BE USED FOR. *** The SERVER owns the
 * budget page's grouping and totals: `GET /budgets/overview` returns `groups[]`
 * with each budget already assigned and each subtotal already summed, and the
 * page renders those figures rather than deriving them. Two implementations of
 * one rule is exactly what the design's "one writer" paragraph forbids, and a
 * client that re-derived group membership would be a second chance to disagree
 * with the database.
 *
 * So `effectiveSpendingType` is for the places with NO server-side grouping to
 * lean on: the category screen and the group control, which need to show a
 * subcategory the value it has INHERITED rather than a blank. It is deliberately
 * the same rule the server applies, so the two never disagree -- but the budget
 * page reads the server's answer, not this one.
 *
 * *** NULL IS A REAL STATE. *** It means unsorted and it renders as its own
 * section. Folding it into a group would be a guess presented as a fact (D-77),
 * and Unsorted having content is what tells the user there is something to do.
 *
 * *** FIXED MEANS CONTRACTUALLY COMMITTED, NOT ESSENTIAL. *** Groceries is
 * flexible: you must eat, and you still choose weekly.
 */

export type SpendingType = 'fixed' | 'flexible' | 'non_monthly';

export interface GroupableCategory {
  id: number;
  name: string;
  /** ABSENT or null on a payload from a backend that predates this feature. */
  spending_type: SpendingType | null;
  parent_id: number | null;
}

/** Committed first, then what you choose, then what arrives irregularly. */
export const GROUP_ORDER: readonly SpendingType[] = ['fixed', 'flexible', 'non_monthly'];

export const GROUP_LABELS: Record<SpendingType, string> = {
  fixed: 'Fixed',
  flexible: 'Flexible',
  non_monthly: 'Non-Monthly',
};

export const UNSORTED_LABEL = 'Unsorted';

const isSpendingType = (value: unknown): value is SpendingType =>
  value === 'fixed' || value === 'flexible' || value === 'non_monthly';

/**
 * A category's own value, or its parent's, or null.
 *
 * One level of inheritance and no more, which mirrors the server: `budget.py:72`
 * rolls up exactly one level of subcategory, so a deeper walk here would disagree
 * with the totals the server computes.
 */
export function effectiveSpendingType(
  category: GroupableCategory,
  byId: Map<number, GroupableCategory>,
): SpendingType | null {
  if (isSpendingType(category.spending_type)) return category.spending_type;
  // A category that is its own parent, or points at one not in the payload, is
  // unsorted rather than an infinite loop. Both are reachable: pagination and a
  // permission filter can both drop a parent.
  if (category.parent_id === null || category.parent_id === category.id) return null;
  const parent = byId.get(category.parent_id);
  if (parent === undefined) return null;
  return isSpendingType(parent.spending_type) ? parent.spending_type : null;
}
