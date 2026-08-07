/**
 * Analytics Service
 * Handles all analytics and dashboard API calls
 */

import { api } from './api';

export interface DashboardMetrics {
  monthly_spending: number;
  net_balance: number;
  total_assets: number;
  budget_remaining: number;
  currency_symbol: string;
  currency_code: string;
}

export interface SpendingTrend {
  date: string;
  amount: number;
  category?: string;
}

// `CategoryBreakdown` used to sit here, declaring
// category_id/category_name/amount/percentage/count. No endpoint returns that
// shape, and its only consumers were the four dead methods removed alongside it.
// `CategoryTotal` below is what `/analytics/categories/top` and the dashboard's
// `top_categories` actually send.

/**
 * What /analytics/categories/top actually returns.
 *
 * Separate from CategoryBreakdown, which describes a different endpoint and does
 * not match this one: it declares category_id/category_name/percentage/count,
 * none of which appear in this payload. Callers were reading `cat.name` through
 * the wrong type and TypeScript was rightly complaining.
 */
export interface CategoryTotal {
  name: string;
  amount: number;
  color: string | null;
  icon: string | null;
}

export interface MonthlyComparison {
  month: string;
  income: number;
  expenses: number;
  net: number;
  income_change_pct: number;
  expenses_change_pct: number;
  net_change_pct: number;
}

/**
 * A transaction as `/analytics/dashboard` serializes it — not the shape
 * `/api/v1/transactions/` returns. `category` and `account` degrade to the
 * strings 'Uncategorized' / 'Unknown' when absent rather than to null.
 */
export interface DashboardExpense {
  id: number;
  description: string;
  amount: number;
  date: string | null;
  transaction_type: string;
  category: { name: string; color: string | null; icon: string | null } | 'Uncategorized';
  account: { name: string; color: string | null } | 'Unknown';
}

/**
 * What `/analytics/dashboard` actually returns, verified against the deployed
 * endpoint and against the handler that builds the payload.
 *
 * The previous declaration described none of it: `metrics`, `spending_trends`,
 * `income_trends`, `monthly_comparison` and `recent_transactions` have never
 * appeared in this response, while everything Dashboard.tsx reads — `net_worth`,
 * `current_month_income`, `current_month_expenses_only`, `expenses` — was
 * absent. Eight of the page's typecheck errors were the compiler correctly
 * reporting that this interface was fiction; the page was right about the server.
 *
 * `total_*` are year-to-date and `current_month_*` are this month. A card
 * labelled "monthly" must read the latter — confusing the two is what PR #41
 * fixed.
 */
export interface DashboardData {
  net_worth: number;
  total_income: number;
  total_expenses_only: number;
  total_expenses: number;
  current_month_total: number;
  current_month_expenses_only: number;
  current_month_income: number;
  net_cash_flow: number;
  savings_rate: number;
  total_assets: number;
  total_debts: number;
  investment_total: number;
  expenses: DashboardExpense[];
  top_categories: CategoryTotal[];
  monthly_labels: string[];
  monthly_amounts: number[];
}

/**
 * What `/analytics/stats` returns: the dashboard payload plus a few extra fields.
 *
 * The previous declaration listed `average_daily_spending`,
 * `average_transaction_size`, `transaction_count`, `top_spending_day`,
 * `top_spending_category`, `spending_by_category` and `spending_by_month` — none
 * of which the endpoint has ever produced. Nobody noticed because the endpoint
 * 500'd on every call: it serialized live SQLAlchemy instances by walking
 * `__dict__` until `RecursionError`. Fixed server-side.
 */
export interface StatsData extends DashboardData {
  monthly_income: number[];
  category_names: string[];
  category_totals: number[];
  tag_names: string[];
  tag_totals: string[] | number[];
  tag_colors: string[];
  liquidity_ratio: number;
  account_growth: number;
  spending_trend: number;
  net_balance: number;
}

export const analyticsService = {
  /**
   * Get dashboard overview data
   */
  /**
   * `memberId` narrows every figure in the payload to one household member —
   * their accounts, plus any account-less rows they entered. Omit for the whole
   * household. An id outside the caller's household answers **403**, not an empty
   * dashboard: a dashboard of zeroes is indistinguishable from a member who has
   * nothing, so the refusal has to be visible. D-18 item E.
   */
  async getDashboardData(memberId?: string | null): Promise<DashboardData> {
    const response = await api.get<{
      success: boolean;
      data: DashboardData;
    }>('/api/v1/analytics/dashboard', {
      params: memberId ? { member_id: memberId } : undefined,
    });
    return response.data.data;
  },

  /**
   * Get detailed statistics
   */
  async getStatistics(
    startDate?: string,
    endDate?: string
  ): Promise<StatsData> {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const response = await api.get<{
      success: boolean;
      data: StatsData;
    }>(`/api/v1/analytics/stats?${params.toString()}`);
    return response.data.data;
  },

  /**
   * Get spending trends over time
   */
  async getSpendingTrends(
    period: 'daily' | 'weekly' | 'monthly' = 'daily',
    startDate?: string,
    endDate?: string
  ): Promise<SpendingTrend[]> {
    const params = new URLSearchParams();
    params.append('period', period);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const response = await api.get<{
      success: boolean;
      trends: SpendingTrend[];
    }>(`/api/v1/analytics/trends?${params.toString()}`);
    return response.data.trends;
  },

  /**
   * Category totals over a date range, highest first.
   *
   * `type` picks the direction: 'expense' is spending, 'income' is where money
   * came from. The range and limit are honoured server-side — until recently
   * they were sent and ignored, so every range returned current-month figures.
   */
  /**
   * `memberId` narrows every figure to one household member. Omit for the whole
   * household; an id outside the caller's household is a **403**, not an empty
   * chart. D-56 — the seven endpoints `Analytics.tsx` renders take the same
   * filter, and they move together, because a page whose charts followed a
   * control while the ones beside them ignored it is D-51.
   */
  async getTopSpendingCategories(
    limit: number = 5,
    startDate?: string,
    endDate?: string,
    type: 'expense' | 'income' = 'expense',
    memberId?: string | null
  ): Promise<CategoryTotal[]> {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    params.append('type', type);
    if (memberId) params.append('member_id', memberId);

    const response = await api.get<{
      success: boolean;
      categories: CategoryTotal[];
    }>(`/api/v1/analytics/categories/top?${params.toString()}`);
    return response.data.categories;
  },

  /**
   * Get monthly comparison data
   */
  async getMonthlyComparison(
    months: number = 6
  ): Promise<MonthlyComparison[]> {
    const params = new URLSearchParams();
    params.append('months', months.toString());

    const response = await api.get<{
      success: boolean;
      data: MonthlyComparison[];
    }>(`/api/v1/analytics/monthly-comparison?${params.toString()}`);
    return response.data.data;
  },

  /**
   * Get financial summary for dashboard
   */
  async getFinancialSummary(): Promise<DashboardMetrics> {
    const response = await api.get<{
      success: boolean;
      summary: DashboardMetrics;
    }>('/api/v1/analytics/summary');
    return response.data.summary;
  },

  /**
   * Get cash flow data (income, expenses, savings over time)
   */
  /**
   * `memberId` narrows every figure to one household member. Omit for the whole
   * household; an id outside the caller's household is a **403**, not an empty
   * chart. D-56 — the seven endpoints `Analytics.tsx` renders take the same
   * filter, and they move together, because a page whose charts followed a
   * control while the ones beside them ignored it is D-51.
   */
  async getCashFlowData(months: number = 6, memberId?: string | null): Promise<Array<{
    month: string;
    income: number;
    expenses: number;
    savings: number;
  }>> {
    // `months` was accepted by this function and then never sent, so /cashflow
    // always returned its own default and the range selector could not move it.
    const response = await api.get<{
      success: boolean;
      cashflow: Array<{
        month: string;
        income: number;
        expenses: number;
        savings: number;
      }>;
    }>('/api/v1/analytics/cashflow', { params: { months, ...(memberId ? { member_id: memberId } : {}) } });
    return response.data.cashflow;
  },

  /**
   * Get financial health metrics
   */
  /**
   * `memberId` narrows every figure to one household member. Omit for the whole
   * household; an id outside the caller's household is a **403**, not an empty
   * chart. D-56 — the seven endpoints `Analytics.tsx` renders take the same
   * filter, and they move together, because a page whose charts followed a
   * control while the ones beside them ignored it is D-51.
   */
  async getFinancialHealth(memberId?: string | null): Promise<{
    totalIncome: number;
    totalExpenses: number;
    netSavings: number;
    savingsRate: number;
    debtToIncome: number;
    emergencyFundMonths: number;
    liquidityRatio: number;
    // null when the user holds no priced investment positions. It used to be
    // 7.5, which showed a fresh user a 7.5% return on an empty portfolio.
    investmentReturn: number | null;
  }> {
    const response = await api.get<{
      success: boolean;
      health: {
        totalIncome: number;
        totalExpenses: number;
        netSavings: number;
        savingsRate: number;
        debtToIncome: number;
        emergencyFundMonths: number;
        liquidityRatio: number;
        investmentReturn: number | null;
      };
    }>('/api/v1/analytics/health', { params: memberId ? { member_id: memberId } : undefined });
    return response.data.health;
  },

  /**
   * Get net worth trend data (assets, liabilities, net worth)
   */
  /**
   * `memberId` narrows every figure to one household member. Omit for the whole
   * household; an id outside the caller's household is a **403**, not an empty
   * chart. D-56 — the seven endpoints `Analytics.tsx` renders take the same
   * filter, and they move together, because a page whose charts followed a
   * control while the ones beside them ignored it is D-51.
   */
  async getNetWorthTrendData(months: number = 12, memberId?: string | null): Promise<Array<{
    month: string;
    netWorth: number;
    assets: number;
    liabilities: number;
  }>> {
    const response = await api.get<{
      success: boolean;
      networth: Array<{
        month: string;
        netWorth: number;
        assets: number;
        liabilities: number;
      }>;
    }>('/api/v1/analytics/networth', { params: { months, ...(memberId ? { member_id: memberId } : {}) } });
    return response.data.networth;
  },
};

export default analyticsService;
