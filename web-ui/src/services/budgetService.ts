/**
 * Budget Service
 * Handles all budget-related API calls
 */

import { api } from './api';

export interface Budget {
  id: number;
  name: string;
  amount: number;
  period: 'weekly' | 'monthly' | 'yearly';
  category_id?: number;
  start_date: string;
  end_date?: string;
  is_active: boolean;
  rollover?: boolean;
  rollover_amount?: number;
  user_id: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * *** THE SERVER OWNS EVERY FIGURE HERE (D-101). *** The page renders these
 * numbers; it must not re-sum `budgets` to derive a group subtotal or a total,
 * because two clients summing independently is two chances to disagree with
 * each other and with the database.
 */
export type SpendingTypeValue = 'fixed' | 'flexible' | 'non_monthly';

export type BudgetRow = Budget & { spent: number; remaining: number; percentage: number };

export interface SpendingGroup {
  spending_type: SpendingTypeValue;
  /** 'Fixed' | 'Flexible' | 'Non-Monthly' -- for a person, not for the database. */
  label: string;
  planned: number;
  actual: number;
  /** Negative when overspent. NEVER clamped: a 0 the user acts on is a lie. */
  remaining: number;
  budgets: BudgetRow[];
}

export interface UnsortedSection {
  /** Categories money has actually left through, not every unclassified one. */
  count: number;
  actual: number;
  categories: Array<{ id: number; name: string; actual: number }>;
  budget_count: number;
  budgets: BudgetRow[];
}

export interface BudgetOverview {
  total_budget: number;
  total_spent: number;
  total_remaining: number;
  percentage_used: number;
  budget_count: number;
  budgets: BudgetRow[];
  /** Always three, always in order, present even when empty. */
  groups: SpendingGroup[];
  unsorted: UnsortedSection;
  totals: { planned: number; actual: number; remaining: number };
  /** null means "nothing recorded this month" -- it is NOT zero. */
  income: number | null;
  /** null whenever `income` is null. Negative when over-committed. */
  left_to_budget: number | null;
}

export interface CreateBudgetData {
  name: string;
  amount: number;
  period: 'weekly' | 'monthly' | 'yearly';
  /** Required: the column is NOT NULL and the API now rejects a create without it (D-74). */
  category_id: number;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
  rollover?: boolean;
}

export interface UpdateBudgetData {
  name?: string;
  amount?: number;
  period?: 'weekly' | 'monthly' | 'yearly';
  category_id?: number;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
  rollover?: boolean;
}

export interface BudgetProgress {
  success: boolean;
  budget_id: number;
  budget_name: string;
  budget_amount: number;
  spent: number;
  remaining: number;
  percentage: number;
  status: 'on_track' | 'warning' | 'over_budget';
}

export const budgetService = {
  /**
   * Get all budgets for current user
   */
  async getBudgets(): Promise<Budget[]> {
    const response = await api.get<{ success: boolean; budgets: Budget[] }>(
      '/api/v1/budgets'
    );
    return response.data.budgets;
  },

  /**
   * Get a specific budget by ID
   */
  async getBudget(id: number): Promise<Budget> {
    const response = await api.get<{ success: boolean; budget: Budget }>(
      `/api/v1/budgets/${id}`
    );
    return response.data.budget;
  },

  /**
   * Create a new budget
   */
  async createBudget(data: CreateBudgetData): Promise<Budget> {
    const response = await api.post<{
      success: boolean;
      budget: Budget;
      message: string;
    }>('/api/v1/budgets', data);
    return response.data.budget;
  },

  /**
   * Update a budget
   */
  async updateBudget(id: number, data: UpdateBudgetData): Promise<Budget> {
    const response = await api.put<{
      success: boolean;
      budget: Budget;
      message: string;
    }>(`/api/v1/budgets/${id}`, data);
    return response.data.budget;
  },

  /**
   * Delete a budget
   */
  async deleteBudget(id: number): Promise<void> {
    await api.delete(`/api/v1/budgets/${id}`);
  },

  /**
   * Get budget progress and spending details
   */
  async getBudgetProgress(id: number): Promise<BudgetProgress> {
    const response = await api.get<BudgetProgress>(
      `/api/v1/budgets/${id}/progress`
    );
    return response.data;
  },

  /**
   * Get budget overview for all budgets
   */
  async getBudgetOverview(): Promise<BudgetOverview> {
    const response = await api.get<BudgetOverview & { success: boolean }>(
      '/api/v1/budgets/overview');
    // *** RETURNED WHOLE, NOT FIELD BY FIELD. *** This used to rebuild the
    // object key by key, so every field the server added was silently dropped
    // here and the page could never see it however correct the payload was.
    // `groups`, `unsorted`, `totals`, `income` and `left_to_budget` would all
    // have vanished at this line.
    const { success: _ignored, ...overview } = response.data;
    return overview;
  },
};

export default budgetService;
