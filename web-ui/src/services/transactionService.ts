/**
 * Transaction Service
 * Handles all transaction-related API calls
 */

import { api } from './api';

export interface Transaction {
  id: number;
  description: string;
  amount: number;
  date: string;
  currency_code: string;
  card_used?: string;
  category_id?: number;
  account_id?: number;
  transaction_type: 'expense' | 'income' | 'transfer';
  notes?: string;
  split_method?: string;
  split_with?: string;
  paid_by?: number;
  user_id: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateTransactionData {
  description: string;
  amount: number;
  date: string;
  currency_code?: string;
  card_used?: string;
  category_id?: number;
  account_id?: number;
  transaction_type?: 'expense' | 'income' | 'transfer';
  notes?: string;
  split_method?: string;
  split_with?: string;
  paid_by?: number;
}

export interface UpdateTransactionData {
  description?: string;
  amount?: number;
  date?: string;
  currency_code?: string;
  card_used?: string;
  category_id?: number;
  account_id?: number;
  transaction_type?: 'expense' | 'income' | 'transfer';
  notes?: string;
  split_method?: string;
  split_with?: string;
}

export interface TransactionFilters {
  page?: number;
  per_page?: number;
  start_date?: string;
  end_date?: string;
  category_id?: number;
  account_id?: number;
  type?: 'expense' | 'income' | 'transfer';
  search?: string;
}

export interface PaginatedTransactions {
  transactions: Transaction[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export const transactionService = {
  /**
   * Get all transactions with optional filters
   */
  async getTransactions(
    filters?: TransactionFilters
  ): Promise<PaginatedTransactions> {
    const params = new URLSearchParams();

    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.per_page) params.append('per_page', filters.per_page.toString());
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);
    if (filters?.category_id)
      params.append('category_id', filters.category_id.toString());
    if (filters?.account_id)
      params.append('account_id', filters.account_id.toString());
    if (filters?.type) params.append('type', filters.type);
    if (filters?.search) params.append('search', filters.search);

    const response = await api.get<{
      success: boolean;
      transactions: Transaction[];
      pagination: PaginatedTransactions['pagination'];
    }>(`/api/v1/transactions?${params.toString()}`);

    return {
      transactions: response.data.transactions,
      pagination: response.data.pagination,
    };
  },

  /**
   * Get a specific transaction by ID
   */
  async getTransaction(id: number): Promise<Transaction> {
    const response = await api.get<{ success: boolean; transaction: Transaction }>(
      `/api/v1/transactions/${id}`
    );
    return response.data.transaction;
  },

  /**
   * Create a new transaction
   */
  async createTransaction(data: CreateTransactionData): Promise<Transaction> {
    const response = await api.post<{
      success: boolean;
      transaction: Transaction;
      message: string;
    }>('/api/v1/transactions', data);
    return response.data.transaction;
  },

  /**
   * Update a transaction
   */
  async updateTransaction(
    id: number,
    data: UpdateTransactionData
  ): Promise<Transaction> {
    const response = await api.put<{
      success: boolean;
      transaction: Transaction;
      message: string;
    }>(`/api/v1/transactions/${id}`, data);
    return response.data.transaction;
  },

  /**
   * Delete a transaction
   */
  async deleteTransaction(id: number): Promise<void> {
    await api.delete(`/api/v1/transactions/${id}`);
  },

  /**
   * Get recent transactions
   */
  async getRecentTransactions(limit: number = 10): Promise<Transaction[]> {
    const response = await api.get<{
      success: boolean;
      transactions: Transaction[];
    }>(`/api/v1/transactions/recent?limit=${limit}`);
    return response.data.transactions;
  },

  /**
   * Bulk create or update transactions
   */
  async bulkCreateTransactions(
    transactions: CreateTransactionData[]
  ): Promise<Transaction[]> {
    const response = await api.post<{
      success: boolean;
      transactions: Transaction[];
      message: string;
    }>('/api/v1/transactions/bulk', { transactions });
    return response.data.transactions;
  },

  /**
   * Export transactions
   */
  async exportTransactions(
    filters?: TransactionFilters,
    format: 'csv' | 'json' = 'csv'
  ): Promise<Blob> {
    const params = new URLSearchParams();
    params.append('format', format);

    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);
    if (filters?.category_id)
      params.append('category_id', filters.category_id.toString());
    if (filters?.account_id)
      params.append('account_id', filters.account_id.toString());
    if (filters?.type) params.append('type', filters.type);

    const response = await api.get(`/api/v1/transactions/export?${params.toString()}`, {
      responseType: 'blob',
    });

    return response.data;
  },

  /**
   * Split a transaction
   */
  async splitTransaction(
    id: number,
    splitData: {
      split_method: string;
      split_with: string;
      amounts?: number[];
    }
  ): Promise<Transaction> {
    const response = await api.post<{
      success: boolean;
      transaction: Transaction;
      message: string;
    }>(`/api/v1/transactions/${id}/split`, splitData);
    return response.data.transaction;
  },
};

export default transactionService;
