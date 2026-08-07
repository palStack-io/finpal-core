/**
 * Transaction Service
 * Handles all transaction-related API calls
 */

import { api } from './api';
import { transactionsApi, TransactionQuery } from './api/transactions';

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

/**
 * **This module used to declare its own copy of the endpoint's filters, and the
 * two had already drifted — AUDIT D-57.** `services/api/transactions.ts` gained
 * `member_id` in #76 and this one did not, so `Dashboard.tsx` — which reads
 * through here — could not filter its recent strip at all until #79 added the
 * field by hand. Same shape as D-45's duplicate `Currency` unions: two
 * same-named types, consumers getting different ones, invisible until something
 * needed the newer half.
 *
 * There is one declaration now, and it lives with the module that owns the HTTP
 * call. Re-exported under the old name so existing imports keep working, because
 * a rename would bury the fix inside an unrelated diff.
 */
export type TransactionFilters = TransactionQuery;


export interface TransactionSummary {
  total_income: number;
  total_expense: number;
  net_balance: number;
}

export interface PaginatedTransactions {
  transactions: Transaction[];
  /** Totals over the whole filtered query, not just the returned page. */
  summary: TransactionSummary;
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
  /**
   * Delegates to `transactionsApi.getAll` rather than rebuilding the query.
   *
   * This used to hand-assemble its own `URLSearchParams`, field by field — which
   * is how `member_id` came to be honoured by one module and silently dropped by
   * the other even after both types knew about it. One builder means a filter
   * added anywhere is sent everywhere.
   *
   * The trailing slash still matters and now lives in `API_CONFIG`: without it
   * this reaches a legacy handler that reads none of the parameters and returns
   * no `pagination`, so `per_page` becomes a lie and every caller gets the whole
   * history.
   */
  async getTransactions(
    filters?: TransactionFilters
  ): Promise<PaginatedTransactions> {
    const data = await transactionsApi.getAll(filters);

    return {
      transactions: data.transactions as unknown as Transaction[],
      summary: data.summary,
      pagination: data.pagination,
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

};

export default transactionService;
