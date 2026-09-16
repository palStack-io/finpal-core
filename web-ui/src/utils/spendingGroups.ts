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

/**
 * What a month's spending actually split into — fixed, flexible, non-monthly.
 *
 * *** THE JOIN IS BY NAME, BECAUSE THE PAYLOAD GIVES NOTHING ELSE. ***
 * `GET /analytics/categories/top` returns `{name, amount, color, icon}` and no
 * category id, so spend can only be matched to a spending type through the
 * category's name. That is not safe in general, and it is measurably not safe
 * here: the demo has **six duplicated category names**, and one of them
 * ("Business") resolves to two DIFFERENT effective spending types.
 *
 * So a name that is ambiguous is refused rather than guessed. Silently taking
 * whichever category the map happened to hold last would put someone's spend
 * in the wrong column of a figure they are meant to make a decision from, and
 * they would have no way to see it happened. The caller gets the ambiguous
 * names back so it can say so on screen.
 *
 * (The real fix is an id on that payload. Until then this is the honest shape,
 * and the refusal is what makes the gap visible instead of invisible.)
 */
export type SpendSplit = {
  fixed: number;
  flexible: number;
  non_monthly: number;
  /** Spend in categories that have no spending type yet, directly or inherited. */
  unsorted: number;
  /** Category names whose spend could not be attributed at all. */
  unattributable: string[];
};

/** Effective spending type per category NAME, or `'ambiguous'` where names disagree. */
export function spendingTypeByName(
  categories: GroupableCategory[],
): Map<string, SpendingType | null | 'ambiguous'> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const out = new Map<string, SpendingType | null | 'ambiguous'>();
  for (const category of categories) {
    const type = effectiveSpendingType(category, byId);
    if (!out.has(category.name)) {
      out.set(category.name, type);
      continue;
    }
    const seen = out.get(category.name);
    if (seen === 'ambiguous') continue;
    // Two categories of the same name agreeing is not ambiguity — it is just a
    // duplicate name, and the answer is the same either way.
    if (seen !== type) out.set(category.name, 'ambiguous');
  }
  return out;
}

export function splitSpendByGroup(
  rows: Array<{ name: string; amount: number }>,
  typeByName: Map<string, SpendingType | null | 'ambiguous'>,
): SpendSplit {
  const split: SpendSplit = {
    fixed: 0, flexible: 0, non_monthly: 0, unsorted: 0, unattributable: [],
  };
  for (const row of rows) {
    const type = typeByName.get(row.name);
    if (type === 'ambiguous' || type === undefined) {
      // `undefined` means the spend names a category the payload did not carry
      // — a filter or a deletion. Also not attributable, also said out loud.
      split.unattributable.push(row.name);
      continue;
    }
    if (type === null) split.unsorted += row.amount;
    else split[type] += row.amount;
  }
  return split;
}
