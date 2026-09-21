/**
 * Where the money came from and where it went, as a flow.
 *
 * *** A SANKEY IS THE ONE CHART THAT CANNOT ROUND, BUNDLE OR DROP ANYTHING
 * QUIETLY. *** Every other chart on the Analytics page can draw the top eight
 * categories and be honest, because a bar is a bar. A flow diagram makes a
 * CLAIM about conservation: the widths leaving a node are the width entering
 * it, and a reader takes that literally — it is the whole reason the chart is
 * worth having. So `categorySpending` and `incomeSources` cannot feed it. They
 * are `.slice(0, 8)`, and the comment beside them says exactly why that is fine
 * for a donut and not for a total: *"using it here would leave everything past
 * the eighth category out of a figure presented as the month's total, which is
 * the silent-undercount shape that has bitten this project before."*
 *
 * This helper therefore takes the FULL lists and bundles the tail explicitly,
 * into a node that says how many categories it stands for. Nothing is dropped;
 * the small flows are named as a group.
 *
 * *** AND IT REFUSES THE TWO CASES WHERE A FLOW WOULD BE A LIE. ***
 *
 *  1. Nothing in and nothing out -> `null`. An empty Sankey frame is decoration
 *     standing in for a fact, the same reason `GoalRange` renders nothing
 *     rather than an empty range.
 *
 *  2. *** SPENT MORE THAN CAME IN. *** This is not an edge case here — the
 *     demo's September is income 250.00 against expenses 2,359.72. The naive
 *     drawing gives "Unspent" a NEGATIVE width, which a renderer either clamps
 *     to zero (so the outflows no longer sum to the inflows, and the chart
 *     silently stops conserving) or draws inverted. Neither is honest. The
 *     shortfall is real money that came from somewhere the period's own
 *     transactions do not identify — savings, a credit card, an overdraft — so
 *     it is drawn as an INPUT that says so, and the sums balance again.
 */

/** One category and its total, as `/analytics/categories/top` returns them. */
export interface FlowCategory {
  name?: string | null;
  amount?: number | null;
}

export interface FlowNode {
  /** Stable key for React and for tests. */
  id: string;
  label: string;
  value: number;
  side: 'in' | 'out';
  /**
   * True for a node that stands for several categories, or for the shortfall —
   * anything whose label a reader should not take as a single category name.
   */
  bundled?: boolean;
}

export interface IncomeFlow {
  /** Everything entering, including a shortfall drawn from outside the period. */
  inflows: FlowNode[];
  /** Everything leaving, including whatever was not spent. */
  outflows: FlowNode[];
  /** The middle node's value. Equals the sum of each side, by construction. */
  total: number;
  /** Income the period's transactions account for, before any shortfall. */
  earned: number;
  /** Total spent in the period. */
  spent: number;
  /**
   * Positive when there is money left, negative when the period overspent.
   * Kept as a signed number so a caller can say which it is rather than infer
   * it from the node list.
   */
  net: number;
}

/** Below this, a flow is a hairline nobody can read or hover. Bundled instead. */
const MAX_NODES_PER_SIDE = 7;

function bundle(
  rows: FlowCategory[],
  side: 'in' | 'out',
  keyPrefix: string,
  bundleLabel: (n: number) => string,
): FlowNode[] {
  const named = rows
    .map((row) => ({
      // An absent name is "we do not know which category", which is a real
      // answer the server gives — `/categories/top` returns an `Uncategorised`
      // bucket with a null colour. It is not an error and must not be dropped.
      label: (row.name || '').trim() || 'Uncategorised',
      value: Number(row.amount) || 0,
    }))
    // A zero or negative category contributes no width and a negative one would
    // break conservation. Refused rather than clamped.
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  if (named.length <= MAX_NODES_PER_SIDE) {
    return named.map((row, i) => ({
      id: `${keyPrefix}-${i}`, label: row.label, value: row.value, side,
    }));
  }

  const head = named.slice(0, MAX_NODES_PER_SIDE - 1);
  const tail = named.slice(MAX_NODES_PER_SIDE - 1);
  const tailTotal = tail.reduce((sum, row) => sum + row.value, 0);

  return [
    ...head.map((row, i) => ({
      id: `${keyPrefix}-${i}`, label: row.label, value: row.value, side,
    })),
    {
      id: `${keyPrefix}-rest`,
      // Says how many, so the bundle cannot be mistaken for one category.
      label: bundleLabel(tail.length),
      value: tailTotal,
      side,
      bundled: true,
    },
  ];
}

/**
 * Build the flow, or `null` when there is nothing to say.
 *
 * Both arguments are the FULL category lists for the period — not the eight a
 * chart draws. See this file's header.
 */
export function incomeFlow(
  income: FlowCategory[],
  expenses: FlowCategory[],
): IncomeFlow | null {
  const inflows = bundle(income, 'in', 'in',
    (n) => `${n} smaller sources`);
  const outflows = bundle(expenses, 'out', 'out',
    (n) => `${n} smaller categories`);

  const earned = inflows.reduce((sum, n) => sum + n.value, 0);
  const spent = outflows.reduce((sum, n) => sum + n.value, 0);

  // Nothing came in and nothing went out: there is no flow, and an empty frame
  // would be a picture of a fact nobody has.
  if (earned <= 0 && spent <= 0) return null;

  const net = earned - spent;

  if (net >= 0) {
    // Money left over. It leaves the middle node like any other outflow,
    // because from the period's point of view that is what it did.
    if (net > 0) {
      outflows.push({
        id: 'out-unspent',
        label: 'Unspent',
        value: net,
        side: 'out',
        bundled: true,
      });
    }
    return { inflows, outflows, total: earned, earned, spent, net };
  }

  /* *** OVERSPENT: THE SHORTFALL IS AN INPUT, NOT A NEGATIVE OUTPUT. ***
     The money was really spent, so it really came from somewhere — and the
     period's own transactions do not say where, because the source is a balance
     that existed before the window opened. Naming it "From savings or credit"
     is the honest description of what is known: it did not come from this
     period's income. Clamping "Unspent" to zero instead would leave the
     outflows wider than the inflows, which is a Sankey that has stopped
     conserving while still looking like one. */
  inflows.push({
    id: 'in-shortfall',
    label: 'From savings or credit',
    value: -net,
    side: 'in',
    bundled: true,
  });

  return { inflows, outflows, total: spent, earned, spent, net };
}
