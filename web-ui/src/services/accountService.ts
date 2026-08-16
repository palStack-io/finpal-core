/**
 * Account Service
 * Handles all account-related API calls
 */

import { api } from './api';

/**
 * Whose money an account is — the single source of truth for attribution across
 * the app (owner decision, 2026-08-06). Added to `AccountSchema` by #72, so it
 * arrives on every account payload and, because `TransactionSchema` nests
 * `AccountSchema`, on every transaction payload too. That is why the "whose
 * account this is" label on the transactions page costs no extra request.
 */
export interface AccountOwner {
  /** A user ID, which in finPal is an email address. */
  id: string;
  name: string;
  color?: string | null;
  emoji?: string | null;
}

export interface Account {
  id: number;
  name: string;
  account_type: string;
  balance: number;
  currency_code: string;
  institution?: string;
  account_number?: string;
  is_active: boolean;
  /**
   * The owner's user ID. **Declared `number` until 2026-08-06** while
   * `Account.user_id` is `String(120)` and user IDs are email addresses — the same
   * lie as D-48's `paid_by`, and invisible for five sessions because the typecheck
   * gate compiled zero files (D-45) and this page holds its accounts as `any[]`.
   * Prefer `owner` for anything user-facing; this is the raw id.
   */
  user_id: string;
  owner?: AccountOwner | null;
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
  color?: string;
  /**
   * The household member to assign this account to — a user ID, which in finPal is
   * an email address. Omit it to assign the account to the calling user.
   *
   * Must be a household member: a demo account or an unknown id is refused with a
   * 400 whose `error` names the reason, so any caller must surface
   * `response.data.error` rather than axios's own message.
   */
  owner_id?: string;
}

export interface UpdateAccountData {
  name?: string;
  account_type?: string;
  balance?: number;
  currency_code?: string;
  institution?: string;
  account_number?: string;
  is_active?: boolean;
  external_id?: string;
  color?: string;
  /** Reassign the account to a different household member. See CreateAccountData. */
  owner_id?: string;
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
   * Connect SimpleFin with the setup token the user copies from SimpleFin Bridge.
   *
   * The token is all a user can obtain; the server base64-decodes it, claims it once,
   * and stores the access URL it gets back. This used to send `access_url` and the
   * server stored whatever arrived without checking it, so pasting the token — the only
   * thing anyone has — reported a healthy connection that could never sync.
   */
  async connectSimpleFin(setupToken: string): Promise<SimpleFinStatus> {
    const response = await api.post<SimpleFinStatus>(
      '/api/v1/accounts/simplefin/connect',
      { setup_token: setupToken }
    );
    return response.data;
  },

  /**
   * Sync every connected SimpleFin account.
   *
   * The backend route existed and nothing called it: the Accounts page's "Sync
   * All" button had a `// TODO: Implement sync` and then toasted "Accounts synced
   * successfully" regardless.
   */
  async syncAllSimpleFin(): Promise<{
    success: boolean;
    message: string;
    results?: unknown;
  }> {
    const response = await api.post<{
      success: boolean;
      message: string;
      results?: unknown;
    }>('/api/v1/accounts/simplefin/sync-all');
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
