/**
 * SHOW A DIMENSION ONLY WHEN THAT DIMENSION VARIES — both axes, on Transactions.
 *
 * The rule came out of the owner's first question about the redesign: a share bar
 * sliced by person degrades to a meaningless full-width block on a one-user
 * instance, and for a self-hosted finance app one user is likely the MAJORITY
 * case rather than the edge case. Generalised: one user means no owner dots, one
 * account means no account column, and the two axes move independently.
 *
 * ── Why this file asserts on rendered output and not on props ────────────────
 *
 * An accepted-and-ignored prop is a dead control, which is D-46 — the dead
 * hamburger that took a prop, rendered, and did nothing. `OwnerBadge` genuinely
 * takes `memberCount` and genuinely returns null, but "the prop is passed" and
 * "the name is absent from the page" are different claims and only the second one
 * is what a user experiences. So every assertion here is `queryByText` over the
 * rendered tree.
 *
 * ── The two axes are tested INDEPENDENTLY, which is the point ────────────────
 *
 * Four combinations, not two. One user with four accounts must still show
 * account names and still hide owner badges; two users with one account must do
 * the reverse. Testing only the 1/1 and 2/4 corners would pass just as happily if
 * a single `if (isSoloInstance)` gated both, which is precisely the collapse the
 * rule forbids.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { Transactions } from '../../pages/Transactions';

const BASE = '*';
const ALICE = { id: 'alice@test.com', name: 'Alice' };
const BOB = { id: 'bob@test.com', name: 'Bob' };

beforeAll(() => { api.defaults.adapter = 'http'; });

beforeEach(() => {
  useAuthStore.setState({
    user: { id: ALICE.id, name: 'Alice', default_currency_code: 'GBP' } as any,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});

const ACCOUNT_NAMES = ['Everyday Current', 'Joint Current', 'Savings Pot', 'Sam Credit'];

function seed({ users, accounts }: { users: number; accounts: number }) {
  const members = [ALICE, BOB].slice(0, users).map((m) => ({
    id: m.id, name: m.name, email: m.id, role: 'member', joinedAt: '2026-01-01',
  }));
  const accountList = ACCOUNT_NAMES.slice(0, accounts).map((name, i) => ({
    id: i + 1, name, account_type: 'checking', balance: 100,
    currency_code: 'GBP', is_active: true,
  }));
  const rows = Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    description: `Row ${i + 1}`,
    amount: 10,
    date: '2026-03-01T00:00:00',
    currency_code: 'GBP',
    transaction_type: 'expense',
    category: { id: 1, name: 'Groceries' },
    account: {
      id: (i % accounts) + 1,
      name: ACCOUNT_NAMES[i % accounts],
      // The owner rides along on the nested account — that is what makes the
      // badge free, and it is also why the two axes read from different fields.
      owner: users > 1 && i % 2 ? BOB : ALICE,
    },
  }));

  server.use(
    http.get(`${BASE}/api/v1/transactions/`, () => HttpResponse.json({
      success: true,
      transactions: rows,
      pagination: { page: 1, per_page: 50, total: 6, pages: 1, has_next: false, has_prev: false },
      summary: { total_income: 0, total_expense: 60, net_balance: -60 },
    })),
    // A bare array. The server sends one; wrapping it makes teamService throw and
    // the page render nothing, which reads exactly like an empty list.
    http.get(`${BASE}/api/v1/team/members`, () => HttpResponse.json(members)),
    http.get(`${BASE}/api/v1/accounts`, () =>
      HttpResponse.json({ success: true, accounts: accountList })),
  );
}

async function renderPage() {
  const view = render(<MemoryRouter><Transactions /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Row 1')).toBeInTheDocument());
  // The accounts request resolves separately from the transactions one, so the
  // subtitle can still be the loading fallback when the rows have landed.
  // Without this the "one account" assertions would race and pass for the wrong
  // reason — a stub, not a decision.
  await waitFor(() =>
    expect(screen.queryByText('Track all your income and expenses')).toBeNull());
  return view;
}

/** Account names as they appear ON ROWS, not in the subtitle. */
const accountNamesOnRows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.fp-ledger-row'))
    .flatMap((row) => ACCOUNT_NAMES.filter((n) => row.textContent?.includes(n)));

describe('the ACCOUNT axis', () => {
  it('one account: the name is on no row, and the subtitle NAMES it instead', async () => {
    seed({ users: 1, accounts: 1 });
    const { container } = await renderPage();

    expect(accountNamesOnRows(container)).toEqual([]);
    // Named, not counted. "1 account" is a fact nobody needs; which account it is
    // is the fact that carries information.
    expect(screen.getByText('Everyday Current')).toBeInTheDocument();
    expect(screen.queryByText(/across 1 account/i)).toBeNull();
  });

  it('four accounts: every row names its account, and the subtitle COUNTS them', async () => {
    seed({ users: 1, accounts: 4 });
    const { container } = await renderPage();

    expect(accountNamesOnRows(container).length).toBe(6);
    expect(screen.getByText('Across 4 accounts')).toBeInTheDocument();
  });
});

describe('the OWNER axis', () => {
  it('one user: no owner badge anywhere', async () => {
    seed({ users: 1, accounts: 4 });
    await renderPage();
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.queryByText('Bob')).toBeNull();
  });

  it('two users: the badge names whose money each row is', async () => {
    seed({ users: 2, accounts: 4 });
    await renderPage();
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
  });
});

describe('THE TWO AXES MOVE INDEPENDENTLY', () => {
  /**
   * The assertion that stops the obvious wrong implementation. Gating both on one
   * "is this a solo instance" flag passes every test above and fails both of
   * these, because each mixes a varying axis with a constant one.
   */
  it('one user + four accounts: account names YES, owner badges NO', async () => {
    seed({ users: 1, accounts: 4 });
    const { container } = await renderPage();

    expect(accountNamesOnRows(container).length).toBe(6);
    expect(screen.queryByText('Bob')).toBeNull();
  });

  it('two users + one account: owner badges YES, account names NO', async () => {
    seed({ users: 2, accounts: 1 });
    const { container } = await renderPage();

    expect(accountNamesOnRows(container)).toEqual([]);
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
    expect(screen.getByText('Everyday Current')).toBeInTheDocument(); // the subtitle
  });
});

describe('the empty instance', () => {
  it('names nothing and counts nothing when there are no accounts yet', async () => {
    // First run: omit, never draw empty. "Across 0 accounts" is a sentence about
    // nothing, and naming an account there is impossible — so the generic line
    // stays, which is the honest fallback rather than a blank.
    seed({ users: 1, accounts: 1 });
    server.use(http.get(`${BASE}/api/v1/accounts`, () =>
      HttpResponse.json({ success: true, accounts: [] })));

    render(<MemoryRouter><Transactions /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Row 1')).toBeInTheDocument());

    expect(screen.queryByText(/across 0 accounts/i)).toBeNull();
    expect(screen.getByText('Track all your income and expenses')).toBeInTheDocument();
  });
});
