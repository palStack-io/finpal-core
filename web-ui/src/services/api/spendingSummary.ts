import { api } from '../api';

/**
 * `/analytics/spending-summary` — the only analytics endpoint that takes a date
 * range, and the one that aggregates in SQL rather than pulling rows into the
 * client to add up.
 *
 * **There was no web client for this until now.** The endpoint was built for MCP
 * (`finpal-mcp/src/tools.ts`) and the browser had no way to reach it, which is
 * why the dashboard's share bar needed one before it needed a component.
 *
 * `owner` groups by the household member who owns the ACCOUNT a row was spent
 * from — D-18's rule, not who typed the row in — so these totals agree with the
 * transactions list. A test in the backend pins that agreement across the two
 * surfaces.
 */
export type SpendingGrouping = 'category' | 'merchant' | 'month' | 'owner';

export interface SpendingGroup {
  /** Category id, description, `YYYY-MM`, or a user id, depending on grouping. */
  key: string | number | null;
  label: string;
  total: number;
  count: number;
}

export interface SpendingSummary {
  groups: SpendingGroup[];
  total: number;
  count: number;
  start_date: string;
  end_date: string;
  group_by: SpendingGrouping;
}

export interface SpendingSummaryParams {
  start_date: string;
  end_date: string;
  group_by?: SpendingGrouping;
}

export const spendingSummaryApi = {
  get: async (params: SpendingSummaryParams): Promise<SpendingSummary> => {
    const response = await api.get<SpendingSummary>(
      '/api/v1/analytics/spending-summary',
      { params }
    );
    return response.data;
  },
};

/** The current calendar month as the endpoint's inclusive ISO range. */
export function currentMonthRange(now = new Date()): { start_date: string; end_date: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    start_date: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    // Day 0 of next month is the last day of this one, and it survives leap
    // years and 31-day months without a table of month lengths.
    end_date: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}
