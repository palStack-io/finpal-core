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
import { beforeAll, describe, it, expect } from 'vitest';
import { api } from '../../services/api';
import transactionService from '../../services/transactionService';
import accountService from '../../services/accountService';
import budgetService from '../../services/budgetService';
import categoryService from '../../services/categoryService';

beforeAll(() => {
  // MSW in Node intercepts Node http/https, not XHR. Override the shared api
  // instance's adapter so requests go through Node's http module instead of XHR.
  api.defaults.adapter = 'http';
});

describe('transactionService contract', () => {
  it('getTransactions returns paginated list with correct shape', async () => {
    const res = await transactionService.getTransactions();
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
    const { pagination } = await transactionService.getTransactions();
    expect(pagination).toHaveProperty('page');
    expect(pagination).toHaveProperty('per_page');
    expect(pagination).toHaveProperty('total');
    expect(pagination).toHaveProperty('pages');
    expect(pagination).toHaveProperty('has_next');
    expect(pagination).toHaveProperty('has_prev');
  });

  it('getTransaction returns a single transaction', async () => {
    const txn = await transactionService.getTransaction(1);
    expect(txn).toHaveProperty('id', 1);
    expect(txn).toHaveProperty('amount');
    expect(txn).toHaveProperty('transaction_type');
  });

  it('createTransaction returns the created transaction', async () => {
    const txn = await transactionService.createTransaction({
      description: 'New',
      amount: 10,
      date: '2026-04-28',
      transaction_type: 'expense',
    });
    expect(txn).toHaveProperty('id');
    expect(txn).toHaveProperty('description');
  });

  it('updateTransaction returns the updated transaction', async () => {
    const txn = await transactionService.updateTransaction(1, { description: 'Updated' });
    expect(txn).toHaveProperty('id', 1);
  });

  it('deleteTransaction resolves without error', async () => {
    await expect(transactionService.deleteTransaction(1)).resolves.toBeUndefined();
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

describe('categoryService contract', () => {
  it('getCategories returns an array of categories with correct shape', async () => {
    const categories = await categoryService.getCategories();
    expect(Array.isArray(categories)).toBe(true);

    const c = categories[0];
    expect(c).toHaveProperty('id');
    expect(c).toHaveProperty('name');
  });
});
