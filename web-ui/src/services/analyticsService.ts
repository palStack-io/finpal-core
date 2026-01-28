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

export interface CategoryBreakdown {
  category_id: number;
  category_name: string;
  amount: number;
  percentage: number;
  count: number;
}

export interface MonthlyComparison {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

export interface DashboardData {
  metrics: DashboardMetrics;
  spending_trends: SpendingTrend[];
  income_trends: SpendingTrend[];
  top_categories: CategoryBreakdown[];
  monthly_comparison: MonthlyComparison[];
  recent_transactions: any[];
}

export interface StatsData {
  total_income: number;
  total_expenses: number;
  net_balance: number;
  average_daily_spending: number;
  average_transaction_size: number;
  transaction_count: number;
  top_spending_day: string;
  top_spending_category: string;
  spending_by_category: CategoryBreakdown[];
  spending_by_month: MonthlyComparison[];
}

export const analyticsService = {
  /**
   * Get dashboard overview data
   */
  async getDashboardData(): Promise<DashboardData> {
    const response = await api.get<{
      success: boolean;
      data: DashboardData;
    }>('/api/v1/analytics/dashboard');
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
   * Get income trends over time
   */
  async getIncomeTrends(
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
    }>(`/api/v1/analytics/income-trends?${params.toString()}`);
    return response.data.trends;
  },

  /**
   * Get category breakdown
   */
  async getCategoryBreakdown(
    startDate?: string,
    endDate?: string
  ): Promise<CategoryBreakdown[]> {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const response = await api.get<{
      success: boolean;
      categories: CategoryBreakdown[];
    }>(`/api/v1/analytics/category-breakdown?${params.toString()}`);
    return response.data.categories;
  },

  /**
   * Get top spending categories
   */
  async getTopSpendingCategories(
    limit: number = 5,
    startDate?: string,
    endDate?: string
  ): Promise<CategoryBreakdown[]> {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const response = await api.get<{
      success: boolean;
      categories: CategoryBreakdown[];
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
      comparison: MonthlyComparison[];
    }>(`/api/v1/analytics/monthly-comparison?${params.toString()}`);
    return response.data.comparison;
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
   * Generate custom report
   */
  async generateReport(
    reportType: 'spending' | 'income' | 'category' | 'budget',
    startDate: string,
    endDate: string,
    options?: {
      category_id?: number;
      account_id?: number;
      format?: 'json' | 'csv' | 'pdf';
    }
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append('type', reportType);
    params.append('start_date', startDate);
    params.append('end_date', endDate);
    if (options?.category_id) params.append('category_id', options.category_id.toString());
    if (options?.account_id) params.append('account_id', options.account_id.toString());
    if (options?.format) params.append('format', options.format);

    const response = await api.get(
      `/api/v1/analytics/reports?${params.toString()}`,
      {
        responseType: options?.format === 'pdf' ? 'blob' : 'json',
      }
    );
    return response.data;
  },

  /**
   * Get net worth over time
   */
  async getNetWorthTrend(
    period: 'daily' | 'weekly' | 'monthly' = 'monthly',
    months: number = 12
  ): Promise<Array<{ date: string; net_worth: number }>> {
    const params = new URLSearchParams();
    params.append('period', period);
    params.append('months', months.toString());

    const response = await api.get<{
      success: boolean;
      trend: Array<{ date: string; net_worth: number }>;
    }>(`/api/v1/analytics/net-worth?${params.toString()}`);
    return response.data.trend;
  },

  /**
   * Get cash flow data (income, expenses, savings over time)
   */
  async getCashFlowData(months: number = 6): Promise<Array<{
    month: string;
    income: number;
    expenses: number;
    savings: number;
  }>> {
    const response = await api.get<{
      success: boolean;
      cashflow: Array<{
        month: string;
        income: number;
        expenses: number;
        savings: number;
      }>;
    }>('/api/v1/analytics/cashflow');
    return response.data.cashflow;
  },

  /**
   * Get financial health metrics
   */
  async getFinancialHealth(): Promise<{
    totalIncome: number;
    totalExpenses: number;
    netSavings: number;
    savingsRate: number;
    debtToIncome: number;
    emergencyFundMonths: number;
    liquidityRatio: number;
    investmentReturn: number;
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
        investmentReturn: number;
      };
    }>('/api/v1/analytics/health');
    return response.data.health;
  },

  /**
   * Get net worth trend data (assets, liabilities, net worth)
   */
  async getNetWorthTrendData(months: number = 12): Promise<Array<{
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
    }>('/api/v1/analytics/networth');
    return response.data.networth;
  },
};

export default analyticsService;
