/**
 * Account Service
 * Handles all account-related API calls
 */

import { api } from './api';

export interface Account {
  id: number;
  name: string;
  account_type: string;
  balance: number;
  currency_code: string;
  institution?: string;
  account_number?: string;
  is_active: boolean;
  user_id: number;
  created_at?: string;
  updated_at?: string;
  import_source?: 'simplefin' | 'csv' | 'manual';
  external_id?: string;
  last_sync?: string;
}

export interface CreateAccountData {
  name: string;
  account_type: string;
  balance?: number;
  currency_code?: string;
  institution?: string;
  account_number?: string;
  is_active?: boolean;
}

export interface UpdateAccountData {
  name?: string;
  account_type?: string;
  balance?: number;
  currency_code?: string;
  institution?: string;
  account_number?: string;
  is_active?: boolean;
}

export interface AccountBalanceResponse {
  success: boolean;
  account_id: number;
  account_name: string;
  balance: number;
  currency_code: string;
}

export const accountService = {
  /**
   * Get all accounts for current user
   */
  async getAccounts(): Promise<Account[]> {
    const response = await api.get<{ success: boolean; accounts: Account[] }>(
      '/api/v1/accounts'
    );
    return response.data.accounts;
  },

  /**
   * Get a specific account by ID
   */
  async getAccount(id: number): Promise<Account> {
    const response = await api.get<{ success: boolean; account: Account }>(
      `/api/v1/accounts/${id}`
    );
    return response.data.account;
  },

  /**
   * Create a new account
   */
  async createAccount(data: CreateAccountData): Promise<Account> {
    const response = await api.post<{
      success: boolean;
      account: Account;
      message: string;
    }>('/api/v1/accounts', data);
    return response.data.account;
  },

  /**
   * Update an account
   */
  async updateAccount(id: number, data: UpdateAccountData): Promise<Account> {
    const response = await api.put<{
      success: boolean;
      account: Account;
      message: string;
    }>(`/api/v1/accounts/${id}`, data);
    return response.data.account;
  },

  /**
   * Delete an account
   */
  async deleteAccount(id: number): Promise<void> {
    await api.delete(`/api/v1/accounts/${id}`);
  },

  /**
   * Get calculated balance for an account
   */
  async getAccountBalance(id: number): Promise<AccountBalanceResponse> {
    const response = await api.get<AccountBalanceResponse>(
      `/api/v1/accounts/${id}/balance`
    );
    return response.data;
  },

  /**
   * Sync SimpleFin account (if connected)
   */
  async syncAccount(id: number): Promise<SyncResult> {
    const response = await api.post<SyncResult>(
      `/api/v1/accounts/${id}/sync`
    );
    return response.data;
  },

  // SimpleFin Integration Methods

  /**
   * Connect SimpleFin with access token
   */
  async connectSimpleFin(accessUrl: string): Promise<SimpleFinStatus> {
    const response = await api.post<SimpleFinStatus>(
      '/api/v1/accounts/simplefin/connect',
      { access_url: accessUrl }
    );
    return response.data;
  },

  /**
   * Get SimpleFin connection status
   */
  async getSimpleFinStatus(): Promise<SimpleFinStatus> {
    const response = await api.get<SimpleFinStatus>(
      '/api/v1/accounts/simplefin/status'
    );
    return response.data;
  },

  /**
   * Disconnect SimpleFin integration
   */
  async disconnectSimpleFin(): Promise<void> {
    await api.post('/api/v1/accounts/simplefin/disconnect');
  },

  /**
   * Fetch available SimpleFin accounts
   */
  async fetchSimpleFinAccounts(): Promise<SimpleFinAccount[]> {
    const response = await api.post<{ success: boolean; accounts: SimpleFinAccount[] }>(
      '/api/v1/accounts/simplefin/fetch'
    );
    return response.data.accounts;
  },

  // Import/Export Methods

  /**
   * Import transactions from CSV file
   */
  async importTransactionsCSV(
    file: File,
    accountId?: number
  ): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('csv_file', file);
    if (accountId) {
      formData.append('account_id', accountId.toString());
    }

    const response = await api.post<ImportResult>(
      '/api/v1/accounts/import-csv',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  /**
   * Export transactions to CSV
   */
  async exportTransactionsCSV(
    accountId?: number,
    startDate?: string,
    endDate?: string
  ): Promise<Blob> {
    const params = new URLSearchParams();
    if (accountId) params.append('account_id', accountId.toString());
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const response = await api.get(
      `/api/v1/accounts/export-csv?${params.toString()}`,
      {
        responseType: 'blob',
      }
    );
    return response.data;
  },
};

// Import types
import type {
  SimpleFinStatus,
  SimpleFinAccount,
  ImportResult,
  SyncResult,
} from '../types/simplefin';

export default accountService;
