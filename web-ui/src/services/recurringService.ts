/**
 * Recurring Service
 * Handles all recurring transaction-related API calls
 */

import { api } from './api';

export interface RecurringExpense {
  id: number;
  description: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  start_date: string;
  end_date?: string;
  last_created?: string;
  active: boolean;
  card_used: string;
  split_method: string;
  paid_by: string;
  user_id: string;
  group_id?: number;
  split_with?: string;
  currency_code?: string;
  original_amount?: number;
  category_id?: number;
  transaction_type: 'expense' | 'income' | 'transfer';
  account_id?: number;
  destination_account_id?: number;
}

export interface CreateRecurringExpenseData {
  description: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  start_date: string;
  end_date?: string;
  category_id?: number;
  account_id?: number;
  transaction_type?: 'expense' | 'income' | 'transfer';
  currency_code?: string;
}

export interface UpdateRecurringExpenseData {
  description?: string;
  amount?: number;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  start_date?: string;
  end_date?: string;
  active?: boolean;
  category_id?: number;
  account_id?: number;
}

export interface RecurringPattern {
  description: string;
  amount: number;
  frequency: string;
  occurrences: number;
  confidence: number;
  pattern_key: string;
  transactions: any[];
}

export const recurringService = {
  /**
   * Get all recurring expenses for current user
   */
  async getRecurringExpenses(): Promise<RecurringExpense[]> {
    const response = await api.get<{ success: boolean; recurring: RecurringExpense[] }>(
      '/api/v1/recurring'
    );
    return response.data.recurring;
  },

  /**
   * Get a specific recurring expense by ID
   */
  async getRecurringExpense(id: number): Promise<RecurringExpense> {
    const response = await api.get<{ success: boolean; recurring: RecurringExpense }>(
      `/api/v1/recurring/${id}`
    );
    return response.data.recurring;
  },

  /**
   * Create a new recurring expense
   */
  async createRecurringExpense(data: CreateRecurringExpenseData): Promise<RecurringExpense> {
    const response = await api.post<{
      success: boolean;
      recurring: RecurringExpense;
      message: string;
    }>('/api/v1/recurring', data);
    return response.data.recurring;
  },

  /**
   * Update a recurring expense
   */
  async updateRecurringExpense(
    id: number,
    data: UpdateRecurringExpenseData
  ): Promise<RecurringExpense> {
    const response = await api.put<{
      success: boolean;
      recurring: RecurringExpense;
      message: string;
    }>(`/api/v1/recurring/${id}`, data);
    return response.data.recurring;
  },

  /**
   * Toggle active status of recurring expense
   */
  async toggleRecurringExpense(id: number): Promise<{ active: boolean }> {
    const response = await api.post<{
      success: boolean;
      active: boolean;
      message: string;
    }>(`/api/v1/recurring/${id}/toggle`);
    return { active: response.data.active };
  },

  /**
   * Delete a recurring expense
   */
  async deleteRecurringExpense(id: number): Promise<void> {
    await api.delete(`/api/v1/recurring/${id}`);
  },

  /**
   * Detect recurring transaction patterns
   */
  async detectRecurringPatterns(): Promise<RecurringPattern[]> {
    const response = await api.get<{ success: boolean; patterns: RecurringPattern[] }>(
      '/api/v1/recurring/detect'
    );
    return response.data.patterns;
  },

  /**
   * Ignore a detected recurring pattern
   */
  async ignorePattern(patternKey: string): Promise<void> {
    await api.post('/api/v1/recurring/ignore', { pattern_key: patternKey });
  },

  /**
   * Create recurring expense from detected pattern
   */
  async createFromPattern(patternKey: string): Promise<RecurringExpense> {
    const response = await api.post<{
      success: boolean;
      recurring: RecurringExpense;
      message: string;
    }>('/api/v1/recurring/create-from-pattern', { pattern_key: patternKey });
    return response.data.recurring;
  },
};

export default recurringService;
