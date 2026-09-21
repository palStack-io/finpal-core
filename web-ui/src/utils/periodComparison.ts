/**
 * This period against the one before it, per category.
 *
 * *** A COMPARISON HAS THREE STATES AND TWO OF THEM ARE NOT NUMBERS. *** A
 * category can be in both periods (a change), in this one only (new), or in the
 * last one only (stopped). The third is the one a naive implementation drops,
 * because it iterates the CURRENT list — and "you stopped spending £200 a month
 * on X" is often the most interesting thing on the screen. All three are
 * returned, and the caller can tell them apart without inferring.
 *
 * *** AND A PERCENTAGE FROM ZERO IS NOT A BIG PERCENTAGE, IT IS NO PERCENTAGE.
 * *** `deltaPct` is **null** when the previous period was 0, never `Infinity`
 * and never 100. This is the same rule `holdingTotals.gainPercent` follows for
 * the same reason: a figure the data cannot support must be absent rather than
 * impressive. A caller that wants to say something says "new", which is true.
 *
 * Deliberately NOT a second fetch. `Analytics.loadAnalytics` already pulls the
 * current and prior category lists at `limit=50` — it needs both for the
 * savings-rate deltas — so this is a second reading of data the page has, which
 * also means it cannot disagree with the "% vs last period" figures on the
 * cards above it.
 */

/** One category and its total, as `/analytics/categories/top` returns them. */
export interface PeriodCategory {
  name?: string | null;
  amount?: number | null;
}

export interface ComparisonRow {
  name: string;
  /** Total in the selected period. */
  now: number;
  /** Total in the equal-length period immediately before it. */
  before: number;
  /** `now - before`. Positive means more was spent/earned this time. */
  delta: number;
  /**
   * Percentage change, or **null when `before` is 0** — there is no percentage
   * change from nothing. Callers render "new" rather than a number.
   */
  deltaPct: number | null;
  /** True when this category did not exist in the previous period. */
  isNew: boolean;
  /** True when it existed then and not now. */
  stopped: boolean;
}

export interface PeriodComparison {
  rows: ComparisonRow[];
  nowTotal: number;
  beforeTotal: number;
  /** Signed. Positive means this period is larger. */
  delta: number;
  /** Null when the previous period was 0, for the reason above. */
  deltaPct: number | null;
}

/** More than this and the chart is a wall of hairlines nobody can read. */
const MAX_ROWS = 8;

const clean = (rows: PeriodCategory[]) => {
  const out = new Map<string, number>();
  for (const row of rows) {
    const name = (row.name || '').trim() || 'Uncategorised';
    const value = Number(row.amount) || 0;
    // A zero or negative row contributes no bar. A refund booked as a negative
    // expense is real in this data model and cannot be drawn as a length.
    if (value <= 0) continue;
    out.set(name, (out.get(name) ?? 0) + value);
  }
  return out;
};

/**
 * Build the comparison, or `null` when neither period has anything.
 *
 * Both arguments are FULL category lists, not the eight a chart draws: a
 * comparison that silently omits a category makes "what changed" wrong rather
 * than merely incomplete.
 */
export function comparePeriods(
  current: PeriodCategory[],
  previous: PeriodCategory[],
): PeriodComparison | null {
  const now = clean(current);
  const before = clean(previous);
  if (now.size === 0 && before.size === 0) return null;

  // The union, so a category that STOPPED is not lost by iterating only the
  // current period — the mistake this helper exists to make impossible.
  const names = new Set([...now.keys(), ...before.keys()]);

  const all: ComparisonRow[] = [...names].map((name) => {
    const a = now.get(name) ?? 0;
    const b = before.get(name) ?? 0;
    return {
      name,
      now: a,
      before: b,
      delta: a - b,
      deltaPct: b > 0 ? ((a - b) / b) * 100 : null,
      isNew: b === 0 && a > 0,
      stopped: a === 0 && b > 0,
    };
  });

  /* Sorted by the SIZE OF THE CHANGE, not by amount. The question this chart
     answers is "what moved", and sorting by total just reproduces the spending
     chart one tab over with a second bar bolted on. */
  all.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  const rows = all.slice(0, MAX_ROWS);

  // Totals come from EVERY category, not from the rows drawn, so the headline
  // cannot disagree with the tab beside it just because the chart is truncated.
  const nowTotal = [...now.values()].reduce((t, v) => t + v, 0);
  const beforeTotal = [...before.values()].reduce((t, v) => t + v, 0);

  return {
    rows,
    nowTotal,
    beforeTotal,
    delta: nowTotal - beforeTotal,
    deltaPct: beforeTotal > 0 ? ((nowTotal - beforeTotal) / beforeTotal) * 100 : null,
  };
}
