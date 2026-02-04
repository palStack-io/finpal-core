import { api } from '../api';
import { API_CONFIG } from '../../config/api';

export interface Transaction {
  id: number;
  name?: string;
  description: string;
  amount: number;
  date: string;
  category?: {
    id: number;
    name: string;
    icon?: string;
  };
  category_id?: number;
  type?: 'income' | 'expense';
  transaction_type: string;
  account?: {
    id: number;
    name: string;
    balance?: number;
  };
  account_id?: number;
  currency_code: string;
  group?: string;
  group_id?: number;
  paid_by?: string;
  split_method?: string;
  split_value?: number;
  card_used?: string;
  splits?: any;
  notes?: string;
  category_splits?: {[key: string]: number};
  has_category_splits?: boolean;
}

export interface TransactionSummary {
  total_income: number;
  total_expense: number;
  net_balance: number;
}

export interface TransactionsResponse {
  transactions: Transaction[];
  summary: TransactionSummary;
}

export const transactionsApi = {
  // Get all transactions
  getAll: async (): Promise<TransactionsResponse> => {
    const response = await api.get<TransactionsResponse>(API_CONFIG.endpoints.transactions.list);
    return response.data;
  },

  // Get single transaction
  get: async (id: number): Promise<Transaction> => {
    const response = await api.get<Transaction>(API_CONFIG.endpoints.transactions.get(id));
    return response.data;
  },

  // Create transaction
  create: async (data: Partial<Transaction>): Promise<{ message: string; transaction_id: number }> => {
    const response = await api.post(API_CONFIG.endpoints.transactions.create, data);
    return response.data;
  },

  // Update transaction
  update: async (id: number, data: Partial<Transaction>): Promise<{ message: string }> => {
    const response = await api.put(API_CONFIG.endpoints.transactions.update(id), data);
    return response.data;
  },

  // Delete transaction
  delete: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(API_CONFIG.endpoints.transactions.delete(id));
    return response.data;
  },
};
