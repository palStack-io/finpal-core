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

export interface CreateBudgetData {
  name: string;
  amount: number;
  period: 'weekly' | 'monthly' | 'yearly';
  category_id?: number;
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
   * Get spending for a specific budget
   */
  async getBudgetSpending(id: number): Promise<{
    budget: Budget;
    spent: number;
    remaining: number;
    percentage: number;
  }> {
    const response = await api.get<{
      success: boolean;
      budget: Budget;
      spent: number;
      remaining: number;
      percentage: number;
    }>(`/api/v1/budgets/${id}/spending`);
    return {
      budget: response.data.budget,
      spent: response.data.spent,
      remaining: response.data.remaining,
      percentage: response.data.percentage,
    };
  },

  /**
   * Get budget overview for all budgets
   */
  async getBudgetOverview(): Promise<{
    total_budget: number;
    total_spent: number;
    total_remaining: number;
    budgets: Array<Budget & { spent: number; remaining: number; percentage: number }>;
  }> {
    const response = await api.get<{
      success: boolean;
      total_budget: number;
      total_spent: number;
      total_remaining: number;
      budgets: Array<Budget & { spent: number; remaining: number; percentage: number }>;
    }>('/api/v1/budgets/overview');
    return {
      total_budget: response.data.total_budget,
      total_spent: response.data.total_spent,
      total_remaining: response.data.total_remaining,
      budgets: response.data.budgets,
    };
  },
};

export default budgetService;
