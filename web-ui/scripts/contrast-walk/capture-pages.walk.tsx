/**
 * Captures the Dashboard and Budgets pages so the contrast walk covers them too.
 *
 * *** THE WALK ONLY EVER SAW TRANSACTIONS, AND "UNMEASURED" IS NOT "CLEAN". ***
 * The palette adoption took that page to zero AA failures, which says nothing
 * about the two pages nobody had rendered.
 */
import { it, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { http, HttpResponse } from 'msw';
import { server } from '../../src/__tests__/mocks/server';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { Dashboard } from '../../src/pages/Dashboard';
import { Accounts } from '../../src/pages/Accounts';
import BudgetsMinimal from '../../src/pages/BudgetsMinimal';
import { ToastProvider } from '../../src/contexts/ToastContext';
import { ThemeProvider } from '../../src/contexts/ThemeContext';

const OUT = join(__dirname, 'captured');

/* Stale captures are worse than none: the walk sweeps the directory, so a file
   left from an earlier experiment gets measured as if it were today's code and
   reports failures that were already fixed. Cleared on every run. */
beforeAll(() => {
  if (existsSync(OUT)) {
    for (const f of readdirSync(OUT)) {
      if (f.endsWith('.html') && f !== 'transactions.html') rmSync(join(OUT, f));
    }
  }
});

beforeAll(() => { api.defaults.adapter = 'http'; });
beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'alice@test.com', name: 'Alice', default_currency_code: 'GBP' } as any,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});

/* The two endpoints the shared handlers do not carry. Realistic shapes, because
   a page rendered from empty data has no colours to measure. */
beforeEach(() => {
  server.use(
    http.get('*/api/v1/analytics/dashboard', () => HttpResponse.json({
      success: true,
      net_worth: 46125, monthly_income: 6180, monthly_expenses: 2904,
      savings_rate: 53,
      cash_flow: [{ month: 'Mar', income: 6180, expenses: 2904 }],
      category_breakdown: [
        { name: 'Groceries', total: 420, color: '#15803d' },
        { name: 'Bills', total: 380, color: '#3F7D5C' },
        { name: 'Eating out', total: 210, color: '#AB5437' },
      ],
      accounts: [{ id: 1, name: 'Everyday Current', balance: 1104.55, type: 'checking' }],
    })),
    http.get('*/api/v1/budgets/overview', () => HttpResponse.json({
      success: true,
      total_budget: 2000, total_spent: 1450, total_remaining: 550, percentage_used: 72,
      budgets: [
        { id: 1, name: 'Groceries', category: { name: 'Groceries' }, amount: 500, spent: 480, remaining: 20, percentage: 96, period: 'monthly' },
        { id: 2, name: 'Bills', category: { name: 'Bills' }, amount: 900, spent: 620, remaining: 280, percentage: 69, period: 'monthly' },
        { id: 3, name: 'Fun', category: { name: 'Fun' }, amount: 600, spent: 720, remaining: -120, percentage: 120, period: 'monthly' },
      ],
    })),
  );
});

const cases: [string, React.FC][] = [
  ['dashboard', Dashboard as React.FC],
  ['budgets', BudgetsMinimal as React.FC],
  // Accounts is walked at ONE realistic count. It was measured at 2/8/20 once,
  // to answer a density question; those captures then lingered in `captured/`
  // and the sweep dutifully walked three stale copies of the same page. The
  // capture now clears the directory, and the page is here as itself.
  ['accounts', Accounts as React.FC],
];

it.each(cases)('captures %s', async (name, Page) => {
  const { container } = render(
    <MemoryRouter><ThemeProvider><ToastProvider><Page /></ToastProvider></ThemeProvider></MemoryRouter>
  );
  // Wait for the loading spinner to go, or we capture a spinner and report zero.
  await waitFor(() => {
    expect(container.querySelector('.animate-spin')).toBeNull();
  }, { timeout: 6000 });

  const painted = container.querySelectorAll('*').length;
  if (painted < 50) throw new Error(`${name}: only ${painted} elements — captured a stub`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.html`), container.innerHTML, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`CAPTURED ${name}: ${painted} elements`);
});
