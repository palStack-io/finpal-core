import { api } from '../api';

export interface TransactionRule {
  id: number;
  name: string;
  pattern: string;
  pattern_field: string;
  is_regex: boolean;
  case_sensitive: boolean;
  amount_min?: number;
  amount_max?: number;
  transaction_type_filter?: 'expense' | 'income' | 'transfer';
  auto_category_id?: number;
  auto_category?: string;
  auto_account_id?: number;
  auto_account?: string;
  auto_transaction_type?: 'expense' | 'income' | 'transfer';
  auto_tags?: string[];
  auto_notes?: string;
  priority: number;
  active: boolean;
  match_count: number;
  last_matched?: string;
  created_at: string;
  updated_at: string;
  is_system?: boolean;
}

export interface TransactionRulesResponse {
  rules: TransactionRule[];
}

export interface CreateRuleData {
  name: string;
  pattern: string;
  pattern_field?: string;
  is_regex?: boolean;
  case_sensitive?: boolean;
  amount_min?: number;
  amount_max?: number;
  transaction_type_filter?: string;
  auto_category_id?: number;
  auto_account_id?: number;
  auto_transaction_type?: string;
  auto_tags?: string[];
  auto_notes?: string;
  priority?: number;
  active?: boolean;
}

export const transactionRulesApi = {
  // Get all rules
  getAll: async (): Promise<TransactionRulesResponse> => {
    const response = await api.get<TransactionRulesResponse>('/api/v1/transaction-rules');
    return response.data;
  },

  // Get single rule
  get: async (id: number): Promise<TransactionRule> => {
    const response = await api.get<TransactionRule>(`/api/v1/transaction-rules/${id}`);
    return response.data;
  },

  // Create rule
  create: async (data: CreateRuleData): Promise<{ message: string; rule_id: number; rule: TransactionRule }> => {
    const response = await api.post('/api/v1/transaction-rules', data);
    return response.data;
  },

  // Update rule
  update: async (id: number, data: Partial<CreateRuleData>): Promise<{ message: string; rule: TransactionRule }> => {
    const response = await api.put(`/api/v1/transaction-rules/${id}`, data);
    return response.data;
  },

  // Delete rule
  delete: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/api/v1/transaction-rules/${id}`);
    return response.data;
  },

  // Test rule
  test: async (ruleData: Partial<CreateRuleData>, testTransaction: any): Promise<{ success: boolean; matches: boolean; test_transaction: any; result?: any }> => {
    const response = await api.post('/api/v1/transaction-rules/test', {
      ...ruleData,
      test_transaction: testTransaction
    });
    return response.data;
  },

  // Bulk apply rules to existing transactions
  bulkApply: async (ruleIds?: number[]): Promise<{ success: boolean; transactions_processed: number; transactions_updated: number; error?: string }> => {
    const response = await api.post('/api/v1/transaction-rules/bulk-apply', {
      rule_ids: ruleIds
    });
    return response.data;
  },

  // Get rule suggestions from transaction edit
  getSuggestion: async (transactionId: number, newCategoryId: number): Promise<{ success: boolean; suggestion?: any; message?: string }> => {
    const response = await api.post('/api/v1/transaction-rules/suggest', {
      transaction_id: transactionId,
      new_category_id: newCategoryId
    });
    return response.data;
  },

  // Get rule statistics
  getStats: async (): Promise<{ success: boolean; stats: { total_rules: number; active_rules: number; inactive_rules: number; total_matches: number; most_used_rules: any[] } }> => {
    const response = await api.get('/api/v1/transaction-rules/stats');
    return response.data;
  },
};
