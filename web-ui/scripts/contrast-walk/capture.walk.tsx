/**
 * Renders the real Transactions page and writes its markup out, so headless
 * Chrome can resolve computed styles over it.
 *
 * NOT a test, and deliberately not named like one — the default vitest glob is
 * `**\/*.{test,spec}.*`, so this file is invisible to `npx vitest run` and has to
 * be asked for by name. It uses the vitest runner only because that is where
 * jsdom, MSW and the component's own dependencies already work; making it a
 * standalone script would mean rebuilding all three.
 *
 *   npx vitest run --include "scripts/contrast-walk/capture.walk.tsx"
 *
 * See README.md in this directory for why the walk cannot be a vitest assertion.
 */
import { it, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { server } from '../../src/__tests__/mocks/server';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { Transactions } from '../../src/pages/Transactions';

const BASE = '*';
const OUT = join(__dirname, 'captured');

const ALICE = { id: 'alice@test.com', name: 'Alice' };
const BOB = { id: 'bob@test.com', name: 'Bob' };

beforeAll(() => { api.defaults.adapter = 'http'; });

beforeEach(() => {
  useAuthStore.setState({
    user: { id: ALICE.id, name: 'Alice', default_currency_code: 'GBP' } as any,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});

/** A realistic page: 50 rows over 12 days, both members, all three kinds. */
function seed() {
  const kinds = ['expense', 'expense', 'income', 'expense', 'transfer', 'expense'];
  const list = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    description: [
      'Tesco Extra', 'Pret a Manger', 'Salary — Northwind Ltd', 'Thames Water',
      'To Savings', 'Selfridges',
    ][i % 6],
    amount: [42.18, 8.4, 3410, 38, 500, 212.4][i % 6],
    date: `2026-03-${String((i % 12) + 1).padStart(2, '0')}T00:00:00`,
    currency_code: 'GBP',
    transaction_type: kinds[i % kinds.length],
    category: { id: 1, name: ['Groceries', 'Eating out', 'Income', 'Bills', 'Transfer', 'Shopping'][i % 6] },
    account: {
      id: (i % 2) + 1,
      name: i % 2 ? 'Joint Current' : 'Everyday Current',
      owner: i % 2 ? BOB : ALICE,
    },
  }));

  server.use(
    http.get(`${BASE}/api/v1/transactions/`, () => HttpResponse.json({
      success: true,
      transactions: list,
      pagination: { page: 1, per_page: 50, total: 348, pages: 7, has_next: true, has_prev: false },
      summary: { total_income: 6180, total_expense: 2904, net_balance: 3276 },
    })),
    // A BARE ARRAY — the shape the server actually sends. Wrapping it as
    // `{success, members}` makes teamService throw and the page render nothing,
    // which looks exactly like a component that has no rows.
    http.get(`${BASE}/api/v1/team/members`, () => HttpResponse.json([
      { id: ALICE.id, name: 'Alice', email: ALICE.id, role: 'owner', joinedAt: '2026-01-01' },
      { id: BOB.id, name: 'Bob', email: BOB.id, role: 'member', joinedAt: '2026-01-01' },
    ])),
  );
}

it('captures the rendered Transactions page', async () => {
  seed();
  const { container } = render(<MemoryRouter><Transactions /></MemoryRouter>);
  await waitFor(() => expect(screen.getAllByLabelText('Delete transaction').length)
    .toBeGreaterThan(0), { timeout: 5000 });

  const rows = container.querySelectorAll('.fp-ledger-row').length;
  // Guard the capture. A spinner serializes perfectly and walks to zero
  // failures, which is "a measurement that undercounts looks exactly like a
  // measurement" in its natural habitat.
  if (rows < 50) throw new Error(`captured only ${rows} rows — the walk would inspect a stub`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'transactions.html'), container.innerHTML, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`CAPTURED ${rows} rows -> ${join(OUT, 'transactions.html')}`);
});
