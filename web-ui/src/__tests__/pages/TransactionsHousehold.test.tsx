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

const BASE = 'http://localhost';

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
