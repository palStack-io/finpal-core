import { api } from '../api';
import { API_CONFIG } from '../../config/api';
import type { AccountOwner } from '../accountService';

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
    /**
     * Whose money this row is. Attribution comes from the account, not from
     * `paid_by` and not from `split_with` (owner decision, 2026-08-06), so this is
     * what the per-row owner label reads. Optional because a transaction's account
     * can be deleted, which nulls `account_id` across that account's whole history
     * — such rows fall back to whoever entered them, server-side.
     */
    owner?: AccountOwner | null;
  };
  account_id?: number;
  /**
   * The other side of a transfer. Accepted on create (D-26) and update (D-27) and
   * read by `AddTransactionForm`, but missing from this type — which the vacuous
   * typecheck gate (D-45) meant nothing ever reported.
   */
  destination_account_id?: number | null;
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

export interface TransactionPagination {
  page: number;
  per_page: number;
  total: number;
  pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface TransactionsResponse {
  transactions: Transaction[];
  summary: TransactionSummary;
  pagination: TransactionPagination;
}

export interface TransactionQuery {
  page?: number;
  per_page?: number;
  start_date?: string;
  end_date?: string;
  category_id?: number;
  account_id?: number;
  group_id?: number;
  type?: 'income' | 'expense' | 'transfer';
  search?: string;
  /**
   * Narrow to one household member — the accounts they own, plus any rows they
   * entered that have no account at all. Omit it for the whole household.
   *
   * This narrows the **query**, not the rendered page, which is what keeps the
   * three summary cards describing the rows on screen: the server computes
   * `summary` over the whole filtered set. Passing an id outside the caller's
   * household is a **403**, deliberately — an empty list would be
   * indistinguishable from "that member has no transactions".
   */
  member_id?: string;
}

const toQueryString = (query: TransactionQuery = {}): string => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

export const transactionsApi = {
  /**
   * A page of transactions, with totals for the whole filtered set.
   *
   * `summary` describes every row matching `query`, not the page — so the cards
   * above the list stay true when a filter is applied. `pagination.total` is the
   * count of matching rows; callers that need all of them must page through
   * rather than assume one response holds everything.
   */
  getAll: async (query?: TransactionQuery): Promise<TransactionsResponse> => {
    const response = await api.get<TransactionsResponse>(
      `${API_CONFIG.endpoints.transactions.list}${toQueryString(query)}`
    );
    return response.data;
  },

  /**
   * Every transaction matching `query`, by paging until the server says there is
   * no next page.
   *
   * For the callers that genuinely need the whole set — budget spending has to
   * total a category over a period, and a truncated total is a wrong number
   * shown as a right one. Bounded by `maxPages` so a runaway filter cannot spin
   * forever; if the bound is hit the caller is told rather than handed a partial
   * total silently.
   */
  getAllPages: async (
    query: TransactionQuery = {},
    maxPages = 20
  ): Promise<{ transactions: Transaction[]; complete: boolean; total: number }> => {
    const perPage = query.per_page ?? 200;
    const collected: Transaction[] = [];
    let page = 1;
    let total = 0;
    let hasNext = true;

    while (hasNext && page <= maxPages) {
      const body = await transactionsApi.getAll({ ...query, page, per_page: perPage });
      collected.push(...body.transactions);
      total = body.pagination?.total ?? collected.length;
      hasNext = Boolean(body.pagination?.has_next);
      page += 1;
    }

    return { transactions: collected, complete: !hasNext, total };
  },

  // Get single transaction
  get: async (id: number): Promise<Transaction> => {
    const response = await api.get<Transaction>(API_CONFIG.endpoints.transactions.get(id));
    return response.data;
  },

  // Create transaction
  //
  // Returns the created row, not just its id. This used to be typed
  // `{message, transaction_id}` — the shape of the legacy blueprint handler that
  // served the slash-less URL. That handler is retired and flask-restx now serves
  // both spellings, so the response carries the transaction itself. The mock in
  // __tests__/mocks/handlers.ts already returned this shape, which is why nothing
  // caught the mismatch.
  create: async (
    data: Partial<Transaction>
  ): Promise<{ success: boolean; message: string; transaction: Transaction }> => {
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
