/**
 * The Dashboard's member filter — D-18 item E, and the retirement of its tags.
 *
 * Three things this asserts that a status code cannot see:
 *
 *   * the filter reaches the SERVER as `member_id`. Every figure on this page is
 *     computed server-side over a scoped query, so narrowing in the browser would
 *     leave the cards describing one set of people and the strip another — which
 *     is the exact defect the page is being fixed for;
 *   * **both readers move together.** The four figures come from
 *     `/analytics/dashboard` and the recent strip from `/api/v1/transactions/`,
 *     two endpoints on one page. #76 re-scoped the second and left the first, and
 *     that was D-51. So this pins that one control reaches both, on the request,
 *     not on the intent;
 *   * the per-figure scope tags are **gone**. They existed because the payload
 *     mixed the caller's own net worth with the household's income and no single
 *     caption was true. With the filter, the scope is one answer the user chose,
 *     and leaving the tags beside it would state it twice — differently, the
 *     moment either drifts.
 *
 * The mock returns the payload the way the server does — `{success, data}` with
 * the fields the page actually reads. Shaped deliberately: the D-51 regression
 * test failed for the wrong reason first because its mock was flat, the page's
 * `Promise.all` threw, the catch swallowed it, and every default rendered
 * including the empty thing being asserted on. A green assertion over a page that
 * fell back to defaults inspects nothing.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import Dashboard from '../../pages/Dashboard';

// Following App_routes.test.tsx: the page reads ToastContext, and a toast is not
// what any assertion here is about.
vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: any) => children,
}));

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

/** Whole-household figures, and one member's third of them. */
const FIGURES = {
  household: { net_worth: 9000, current_month_income: 4000, current_month_expenses_only: 1000, savings_rate: 75 },
  [BOB.id]: { net_worth: 3000, current_month_income: 1000, current_month_expenses_only: 500, savings_rate: 50 },
};

function mockDashboard({ members = [ALICE, BOB] }: { members?: (typeof ALICE)[] } = {}) {
  const analyticsCalls: URL[] = [];
  const transactionCalls: URL[] = [];

  server.use(
    http.get(`${BASE}/api/v1/team/members`, () =>
      HttpResponse.json(members.map(member))
    ),
    http.get(`${BASE}/api/v1/analytics/dashboard`, ({ request }) => {
      const url = new URL(request.url);
      analyticsCalls.push(url);
      const memberId = url.searchParams.get('member_id');
      const figures = (memberId && FIGURES[memberId]) || FIGURES.household;

      return HttpResponse.json({
        success: true,
        data: {
          ...figures,
          expenses: [],
          top_categories: [],
          monthly_labels: [],
          monthly_amounts: [],
          monthly_totals: {},
          total_income: figures.current_month_income,
          total_expenses_only: figures.current_month_expenses_only,
          net_cash_flow: figures.current_month_income - figures.current_month_expenses_only,
          total_assets: figures.net_worth,
          total_debts: 0,
          base_currency: 'USD',
        },
      });
    }),
    http.get(`${BASE}/api/v1/transactions/`, ({ request }) => {
      const url = new URL(request.url);
      transactionCalls.push(url);
      const memberId = url.searchParams.get('member_id');
      const all = [
        { id: 1, description: 'Alice groceries', amount: 10, date: '2026-03-01T00:00:00',
          currency_code: 'USD', transaction_type: 'expense', category: { id: 1, name: 'Food' },
          account: { id: 1, name: 'Alice Checking', owner: ALICE } },
        { id: 2, description: 'Bob petrol', amount: 20, date: '2026-03-02T00:00:00',
          currency_code: 'USD', transaction_type: 'expense', category: { id: 1, name: 'Food' },
          account: { id: 2, name: 'Bob Checking', owner: BOB } },
      ];
      const shown = memberId ? all.filter((r) => r.account.owner.id === memberId) : all;

      return HttpResponse.json({
        success: true,
        transactions: shown,
        summary: { total_income: 0, total_expense: 30, net_balance: -30 },
        pagination: { page: 1, per_page: 5, total: shown.length, pages: 1, has_next: false, has_prev: false },
      });
    }),
    http.get(`${BASE}/api/v1/accounts`, () => HttpResponse.json({ success: true, accounts: [] })),
    // NO trailing slash: `budgetService.getBudgets` requests `/api/v1/budgets`.
    // This handler said `/budgets/` and therefore matched NOTHING, so the request
    // escaped MSW and hit the real network — passing here only because something
    // happened to be listening on jsdom's origin, and failing in CI with
    // ECONNREFUSED. A trailing slash picking a different handler is this
    // project's own oldest trap, this time in the mocks rather than the app.
    http.get(`${BASE}/api/v1/budgets`, () => HttpResponse.json({ success: true, budgets: [] }))
  );

  return { analyticsCalls, transactionCalls };
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <ThemeProvider>
        <Dashboard />
      </ThemeProvider>
    </MemoryRouter>
  );

describe('the Dashboard states its scope with a filter, not with four tags', () => {
  it('says the figures are the household’s before anything is chosen', async () => {
    mockDashboard();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Everyone sharing this finPal instance')).toBeInTheDocument()
    );
  });

  it('carries no per-figure scope tags any more', async () => {
    mockDashboard();
    renderPage();

    await waitFor(() => expect(screen.getByText('Net Worth')).toBeInTheDocument());

    // The four cards used to carry YOURS / HOUSEHOLD / a mixed caption between
    // them. Asserted as an absence rather than by counting, so re-adding one
    // anywhere on the page fails this.
    expect(screen.queryByText('YOURS')).not.toBeInTheDocument();
    expect(screen.queryByText('HOUSEHOLD')).not.toBeInTheDocument();
    expect(screen.queryByText(/Of household income, after your expenses/)).not.toBeInTheDocument();
  });

  it('sends member_id to BOTH endpoints the page reads, not just one', async () => {
    const { analyticsCalls, transactionCalls } = mockDashboard();
    renderPage();

    await waitFor(() => expect(screen.getByText('Net Worth')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Show transactions for'), BOB.id);

    // **This is the D-51 assertion.** One control, two endpoints; a page whose
    // figures followed the filter while its recent strip did not would describe
    // two different sets of people at once, which is what happened last time.
    await waitFor(() =>
      expect(analyticsCalls.at(-1)?.searchParams.get('member_id')).toBe(BOB.id)
    );
    expect(transactionCalls.at(-1)?.searchParams.get('member_id')).toBe(BOB.id);
  });

  it('moves the rendered figures, not just the request', async () => {
    mockDashboard();
    renderPage();

    await waitFor(() => expect(screen.getByText('$9,000.00')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Show transactions for'), BOB.id);

    // Read off the screen, because a request carrying the right parameter and a
    // page that ignores the response are indistinguishable from the network side.
    await waitFor(() => expect(screen.getByText('$3,000.00')).toBeInTheDocument());
    expect(screen.queryByText('$9,000.00')).not.toBeInTheDocument();
    expect(screen.getByText("Bob's money")).toBeInTheDocument();
  });

  it('narrows the recent strip with the same control', async () => {
    mockDashboard();
    renderPage();

    await waitFor(() => expect(screen.getByText('Alice groceries')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Show transactions for'), BOB.id);

    await waitFor(() =>
      expect(screen.queryByText('Alice groceries')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Bob petrol')).toBeInTheDocument();
  });

  it('offers no filter at all to a household of one', async () => {
    mockDashboard({ members: [ALICE] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Net Worth')).toBeInTheDocument());

    // With one member there is nobody to narrow to, and a control that filters
    // nothing implies somebody else's money is on the screen.
    expect(screen.queryByLabelText('Show transactions for')).not.toBeInTheDocument();
  });
});
