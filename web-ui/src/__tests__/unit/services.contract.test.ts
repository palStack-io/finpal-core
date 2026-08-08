/**
 * Service contract tests — verify that service layer correctly maps API responses
 * to the TypeScript types we've declared. MSW handlers define the expected API
 * response shape; if the backend changes shape, update the handler AND the service
 * types — the test will fail until both sides are in sync.
 *
 * MSW server is started globally in setup.ts.
 * The 'http' adapter is forced so MSW (Node interceptor) can catch Axios requests
 * instead of the XHR adapter that jsdom uses by default.
 */
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { api } from '../../services/api';
import { transactionsApi } from '../../services/api/transactions';
import accountService from '../../services/accountService';
import budgetService from '../../services/budgetService';
import { categoriesApi } from '../../services/api/categories';

beforeAll(() => {
  // MSW in Node intercepts Node http/https, not XHR. Override the shared api
  // instance's adapter so requests go through Node's http module instead of XHR.
  api.defaults.adapter = 'http';
});

// Repointed 2026-08-07 from `services/transactionService` to
// `services/api/transactions`. The former was a thin ADAPTER — its
// `getTransactions` already delegated to `transactionsApi.getAll` after D-57 — and
// its only remaining app consumer was Dashboard.tsx. Five of its six methods were
// exercised by nothing but this block, so it was a module kept alive by its own
// test. The contract is unchanged; it is asserted against the module that ships.
describe('transactions API contract', () => {
  it('getTransactions returns paginated list with correct shape', async () => {
    const res = await transactionsApi.getAll();
    expect(res).toHaveProperty('transactions');
    expect(res).toHaveProperty('pagination');
    expect(Array.isArray(res.transactions)).toBe(true);

    const txn = res.transactions[0];
    expect(txn).toHaveProperty('id');
    expect(txn).toHaveProperty('description');
    expect(txn).toHaveProperty('amount');
    expect(txn).toHaveProperty('date');
    expect(txn).toHaveProperty('transaction_type');
  });

  it('getTransactions pagination has expected fields', async () => {
    const { pagination } = await transactionsApi.getAll();
    expect(pagination).toHaveProperty('page');
    expect(pagination).toHaveProperty('per_page');
    expect(pagination).toHaveProperty('total');
    expect(pagination).toHaveProperty('pages');
    expect(pagination).toHaveProperty('has_next');
    expect(pagination).toHaveProperty('has_prev');
  });

  // *** THE ENVELOPE IS THE DIFFERENCE, AND IT IS THE WHOLE POINT OF THIS FILE. ***
  // The retired `transactionService` UNWRAPPED these — `return response.data.transaction`
  // — while `services/api/*` returns the envelope, as `groupsApi.getAll` and
  // `categoriesApi.getAll` also do. Two modules for one resource disagreeing about
  // whether the caller gets the envelope is precisely how the two Categories
  // implementations drifted. Asserted here against the module that ships.
  it('get returns the envelope carrying a single transaction', async () => {
    const { transaction: txn } = await transactionsApi.get(1);
    expect(txn).toHaveProperty('id', 1);
    expect(txn).toHaveProperty('amount');
    expect(txn).toHaveProperty('transaction_type');
  });

  it('create returns the envelope carrying the created transaction', async () => {
    const { transaction: txn } = await transactionsApi.create({
      description: 'New',
      amount: 10,
      date: '2026-04-28',
      transaction_type: 'expense',
    });
    expect(txn).toHaveProperty('id');
    expect(txn).toHaveProperty('description');
  });

  it('update returns the envelope carrying the updated transaction', async () => {
    const { transaction: txn } = await transactionsApi.update(1, { description: 'Updated' });
    expect(txn).toHaveProperty('id', 1);
  });

  it('delete resolves without error', async () => {
    await expect(transactionsApi.delete(1)).resolves.toBeDefined();
  });
});

describe('accountService contract', () => {
  it('getAccounts returns an array of accounts with correct shape', async () => {
    const accounts = await accountService.getAccounts();
    expect(Array.isArray(accounts)).toBe(true);

    const acc = accounts[0];
    expect(acc).toHaveProperty('id');
    expect(acc).toHaveProperty('name');
    expect(acc).toHaveProperty('account_type');
    expect(acc).toHaveProperty('balance');
    expect(acc).toHaveProperty('currency_code');
    expect(acc).toHaveProperty('is_active');
  });

  it('createAccount returns the created account', async () => {
    const acc = await accountService.createAccount({ name: 'New', account_type: 'savings' });
    expect(acc).toHaveProperty('id');
    expect(acc).toHaveProperty('name');
  });

  it('updateAccount returns the updated account', async () => {
    const acc = await accountService.updateAccount(1, { name: 'Updated' });
    expect(acc).toHaveProperty('id', 1);
  });

  it('deleteAccount resolves without error', async () => {
    await expect(accountService.deleteAccount(1)).resolves.toBeUndefined();
  });
});

describe('budgetService contract', () => {
  it('getBudgets returns an array of budgets with correct shape', async () => {
    const budgets = await budgetService.getBudgets();
    expect(Array.isArray(budgets)).toBe(true);

    const b = budgets[0];
    expect(b).toHaveProperty('id');
    expect(b).toHaveProperty('name');
    expect(b).toHaveProperty('amount');
    expect(b).toHaveProperty('period');
    expect(b).toHaveProperty('is_active');
  });

  it('createBudget returns the created budget', async () => {
    const b = await budgetService.createBudget({
      name: 'New Budget',
      amount: 200,
      period: 'monthly',
    });
    expect(b).toHaveProperty('id');
    expect(b).toHaveProperty('name');
  });
});

// Repointed 2026-08-07 from `services/categoryService` to `services/api/categories`.
// The former had ZERO importers once #96 deleted `pages/Categories.tsx`, its only
// consumer — so this block was certifying the contract of a module that shipped to
// nobody, which is the shape recorded when DASHBOARD_FIGURE_SCOPE's tests outlived
// the screens that read them. The contract still matters; it just belongs to the
// module that ships.
describe('categories API contract', () => {
  it('getAll returns an array of categories with correct shape', async () => {
    const { categories } = await categoriesApi.getAll();
    expect(Array.isArray(categories)).toBe(true);

    const c = categories[0];
    expect(c).toHaveProperty('id');
    expect(c).toHaveProperty('name');
  });
});

/**
 * **One endpoint, one query builder — AUDIT D-57.**
 *
 * `services/transactionService.ts` and `services/api/transactions.ts` both
 * describe `GET /api/v1/transactions/`. Each used to declare its own filter type
 * *and* assemble its own `URLSearchParams`, and the two had drifted: #76 taught
 * one of them `member_id` and not the other, so `Dashboard.tsx` — which reads
 * through the first — could not filter its recent strip at all.
 *
 * Keyed to behaviour rather than to a type alias: send the same filters through
 * both entry points and require the same URL. A filter added to one builder and
 * not the other fails this, which is exactly what went unnoticed for a session.
 */
/**
 * **One endpoint, one query builder — AUDIT D-57, now true by construction.**
 *
 * This block used to fire the SAME filters through `transactionService.getTransactions`
 * and `transactionsApi.getAll` and require the two URLs to match, because the two
 * modules each assembled their own `URLSearchParams` and had drifted: #76 taught one of
 * them `member_id` and not the other, so `Dashboard.tsx` could not filter its recent
 * strip at all.
 *
 * `transactionService` is now DELETED, so there is no second builder to disagree with.
 * The test is REWRITTEN rather than removed — deleting it would lose the assertion that
 * the surviving builder actually carries its filters, which is the half that still has
 * a subject. Comparing two entry points is what stopped being possible; carrying the
 * filters is what still has to be true.
 */
describe('the transactions endpoint has one query builder', () => {
  it('carries every filter it was given', async () => {
    const seen: string[] = [];
    const spy = vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      seen.push(url);
      return { data: { success: true, transactions: [], summary: {}, pagination: {} } } as any;
    });

    await transactionsApi.getAll({
      page: 2, per_page: 5, search: 'tesco',
      type: 'expense' as const, member_id: 'bob@test.com',
    });

    spy.mockRestore();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('member_id=bob%40test.com');
    expect(seen[0]).toContain('search=tesco');
    expect(seen[0]).toContain('page=2');
    expect(seen[0]).toContain('type=expense');
  });
});
