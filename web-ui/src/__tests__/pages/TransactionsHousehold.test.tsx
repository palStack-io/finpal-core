/**
 * The household surface on the Transactions page — items B and D of the D-18 build.
 *
 * Three things, and every one of them is invisible to a status-code assertion:
 *
 *   * the per-row "whose account this is" label, read from `account.owner`, which
 *     already rides along on the payload;
 *   * the member filter, which must be sent to the SERVER as `member_id` rather
 *     than applied here — the three summary cards come from the server's `summary`
 *     over the whole filtered query, so filtering in the browser would make the
 *     cards describe a different set of rows than the list;
 *   * the single-member rule: a solo household gets no badges, no filter and no
 *     scope tags, because with one member there is nothing to disambiguate.
 *
 * The scope-tag assertions are the ones worth keeping honest. The cards read
 * "YOURS" until 2026-08-06, and the list going household-wide turned that label
 * into a lie about the household's money. Filtering to a HOUSEMATE is neither
 * `yours` nor `household`, so that case deliberately shows no tag at all.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { Transactions } from '../../pages/Transactions';

// A WILDCARD ORIGIN, not a hardcoded one. `*/api/v1/x` matches that path on ANY
// origin, which is what makes these tests independent of whatever base URL the
// environment hands axios.
//
// `http://localhost` worked on a developer's machine and matched NOTHING in CI,
// where the requests arrive relative — the very first CI run of this suite failed
// for exactly that reason. A bare path (`''`) is not the fix either: MSW resolves
// it against the jsdom origin, which put it back on one specific base and broke
// 51 tests. Only the wildcard is origin-agnostic.
const BASE = '*';

const ALICE = { id: 'alice@test.com', name: 'Alice', color: '#22c55e', emoji: '🌱' };
const BOB = { id: 'bob@test.com', name: 'Bob', color: '#3b82f6', emoji: '🐟' };

beforeAll(() => {
  api.defaults.adapter = 'http';
});

beforeEach(() => {
  useAuthStore.setState({
    user: { id: ALICE.id, name: 'Alice', default_currency_code: 'USD' } as any,
    token: 'tok',
    refreshToken: 'r',
    isAuthenticated: true,
  });
});

const member = (o: typeof ALICE) => ({
  id: o.id, name: o.name, email: o.id, role: 'member', joinedAt: '2026-01-01',
});

const row = (id: number, description: string, owner: typeof ALICE) => ({
  id,
  description,
  amount: 10,
  date: '2026-03-01T00:00:00',
  currency_code: 'USD',
  transaction_type: 'expense',
  category: { id: 1, name: 'Food' },
  account: { id: owner === ALICE ? 1 : 2, name: `${owner.name} Checking`, owner },
});

/**
 * A two-member household unless `members` says otherwise, and a transactions
 * endpoint that honours `member_id` the way the server does — narrowing both the
 * rows and the summary, so a page that filtered client-side could not pass.
 */
function mockHousehold({ members = [ALICE, BOB] }: { members?: (typeof ALICE)[] } = {}) {
  const captured: URL[] = [];

  server.use(
    // A bare array, not an envelope — `api/v1/team.py:185` returns the list
    // directly, and it already excludes demo accounts (`is_demo_user=False`), so
    // this really is the household.
    http.get(`${BASE}/api/v1/team/members`, () =>
      HttpResponse.json(members.map(member))
    ),
    http.get(`${BASE}/api/v1/transactions/`, ({ request }) => {
      const url = new URL(request.url);
      captured.push(url);
      const memberId = url.searchParams.get('member_id');

      const all = [row(1, 'Alice groceries', ALICE), row(2, 'Bob petrol', BOB)];
      const shown = memberId ? all.filter((r) => r.account.owner.id === memberId) : all;

      return HttpResponse.json({
        success: true,
        transactions: shown,
        // Income is non-zero so the three cards hold three different values. With
        // income at 0, Total Expenses and Net Balance both read the same figure
        // and an assertion on either is ambiguous — the same trap the sibling
        // Transactions.test.tsx documents.
        summary: {
          total_income: shown.length * 3,
          total_expense: shown.length * 10,
          net_balance: shown.length * 3 - shown.length * 10,
        },
        pagination: {
          page: 1, per_page: 50, total: shown.length, pages: 1,
          has_next: false, has_prev: false,
        },
      });
    })
  );

  return captured;
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <Transactions />
    </MemoryRouter>
  );

describe('Transactions page — household', () => {
  it('labels each row with whose account it is', async () => {
    mockHousehold();
    renderPage();

    await waitFor(() => expect(screen.getByText('Alice groceries')).toBeInTheDocument());

    // The badge carries the member's own emoji and name, so the same person reads
    // the same on every screen.
    expect(screen.getByText('🌱 Alice')).toBeInTheDocument();
    expect(screen.getByText('🐟 Bob')).toBeInTheDocument();
  });

  it('sends the member filter to the server rather than filtering in the browser', async () => {
    const captured = mockHousehold();
    renderPage();

    await waitFor(() => expect(screen.getByText('Bob petrol')).toBeInTheDocument());

    await userEvent.selectOptions(
      screen.getByLabelText('Show transactions for'),
      BOB.id
    );

    await waitFor(() =>
      expect(captured.some((u) => u.searchParams.get('member_id') === BOB.id)).toBe(true)
    );
    await waitFor(() =>
      expect(screen.queryByText('Alice groceries')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Bob petrol')).toBeInTheDocument();
  });

  it('makes the summary cards follow the filter, not the page', async () => {
    mockHousehold();
    renderPage();

    /**
     * The three card values, addressed by their `<h3>`. A transaction row renders
     * its own amount in a `<p>`, and with one row of $10 on screen a bare
     * `getByText('\u2212$10.00')` matches both the row and the card \u2014 so it would pass
     * whether or not the card ever updated.
     */
    const cardValues = () =>
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

    // Both rows: $20 of expenses against $6 of income.
    await waitFor(() => expect(cardValues()).toContain('\u2212$20.00'));

    await userEvent.selectOptions(
      screen.getByLabelText('Show transactions for'),
      BOB.id
    );

    // Bob alone: $10. If the page filtered client-side the card would still say
    // $20, which is the bug this page was fixed for once already.
    await waitFor(() => expect(cardValues()).toContain('\u2212$10.00'));
    expect(cardValues()).not.toContain('\u2212$20.00');
  });

  it('tags the cards HOUSEHOLD by default and drops the tag for a housemate', async () => {
    mockHousehold();
    renderPage();

    await waitFor(() => expect(screen.getAllByText('HOUSEHOLD').length).toBe(3));
    expect(screen.queryByText('YOURS')).not.toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText('Show transactions for'),
      BOB.id
    );

    // Neither `yours` nor `household` is true of Bob's rows on Alice's screen.
    await waitFor(() => expect(screen.queryByText('HOUSEHOLD')).not.toBeInTheDocument());
    expect(screen.queryByText('YOURS')).not.toBeInTheDocument();
    expect(screen.getAllByText('Bob only').length).toBe(3);
  });

  it('tags the cards YOURS when the filter is the signed-in user', async () => {
    mockHousehold();
    renderPage();

    await waitFor(() => expect(screen.getAllByText('HOUSEHOLD').length).toBe(3));

    await userEvent.selectOptions(
      screen.getByLabelText('Show transactions for'),
      ALICE.id
    );

    await waitFor(() => expect(screen.getAllByText('YOURS').length).toBe(3));
  });

  it('shows a solo household no filter, no badges and no scope tags', async () => {
    mockHousehold({ members: [ALICE] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Alice groceries')).toBeInTheDocument());

    // With one member there is nothing to choose and nothing to disambiguate, so
    // every one of the three affordances hides itself.
    expect(screen.queryByLabelText('Show transactions for')).not.toBeInTheDocument();
    expect(screen.queryByText('🌱 Alice')).not.toBeInTheDocument();
    expect(screen.queryByText('HOUSEHOLD')).not.toBeInTheDocument();
    expect(screen.queryByText('YOURS')).not.toBeInTheDocument();
  });
});

/**
 * The Dashboard's Recent Transactions strip.
 *
 * **This surface was missed on the first pass and the miss is the point.** The strip
 * is built from `/api/v1/transactions/` (`getTransactions({per_page: 5})`), not from
 * `/analytics/dashboard` — so making that endpoint household-scoped re-scoped the
 * strip too, silently, while the PR text claimed the dashboard was untouched. A
 * household-scoped list with nothing saying whose rows it holds is worse than either
 * option that was actually considered.
 *
 * Mobile's dashboard is NOT affected and needs no equivalent: it reads
 * `dashboardData.recent_transactions` from `/analytics/dashboard`, which was already
 * household-scoped and already carries `<ScopeTag scope="household" />`.
 */
describe('Dashboard — the recent transactions strip', () => {
  it('names whose row each one is', async () => {
    server.use(
      http.get(`${BASE}/api/v1/team/members`, () =>
        HttpResponse.json([ALICE, BOB].map(member))
      ),
      http.get(`${BASE}/api/v1/transactions/`, () =>
        HttpResponse.json({
          success: true,
          transactions: [row(1, 'Alice groceries', ALICE), row(2, 'Bob petrol', BOB)],
          summary: { total_income: 6, total_expense: 20, net_balance: -14 },
          pagination: { page: 1, per_page: 5, total: 2, pages: 1, has_next: false, has_prev: false },
        })
      ),
      // The strip is loaded inside a Promise.all with three other calls, so any
      // one of them rejecting leaves it empty and this test green for the wrong
      // reason. All four are stubbed deliberately.
      // Nested under `data` — `getDashboardData` returns `response.data.data`.
      // Flattening it makes the payload `undefined`, the whole Promise.all throws,
      // and the page renders every default including an empty strip: green for
      // exactly the wrong reason.
      http.get(`${BASE}/api/v1/analytics/dashboard`, () =>
        HttpResponse.json({
          success: true,
          data: {
            net_worth: 0, total_assets: 0, total_debts: 0,
            current_month_income: 0, current_month_expenses: 0,
            total_income: 0, total_expenses_only: 0,
            net_cash_flow: 0, savings_rate: 0,
            recent_transactions: [], top_categories: [], monthly_trends: [],
          },
        })
      ),
      http.get(`${BASE}/api/v1/accounts`, () =>
        HttpResponse.json({ success: true, accounts: [] })
      ),
      http.get(`${BASE}/api/v1/budgets`, () =>
        HttpResponse.json({ success: true, budgets: [] })
      ),
    );

    // The Dashboard reads ThemeContext and ToastContext, so it needs both
    // providers — unlike Transactions, which reads neither.
    const { Dashboard } = await import('../../pages/Dashboard');
    const { ThemeProvider } = await import('../../contexts/ThemeContext');
    const { ToastProvider } = await import('../../contexts/ToastContext');
    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <Dashboard />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Bob petrol')).toBeInTheDocument());
    expect(screen.getByText('🐟 Bob')).toBeInTheDocument();
    expect(screen.getByText('🌱 Alice')).toBeInTheDocument();
  });
});
