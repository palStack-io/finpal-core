/**
 * The Transactions page must show one page of rows and totals for all of them.
 *
 * It used to call `/api/v1/transactions` (no trailing slash), which reached a
 * handler that read **zero** query parameters: the whole history arrived on every
 * render and `page`, `per_page`, `search` and `type` were built by the page and
 * silently discarded. Filtering happened in the browser, so the three cards above
 * the list described all time no matter what was on screen.
 *
 * These tests assert on rendered output — the row count, the card values, the
 * pager — because the broken version rendered a correct-looking list.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
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

beforeAll(() => {
  api.defaults.adapter = 'http';
});

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'u@test.com', name: 'Test', default_currency_code: 'USD' } as any,
    token: 'tok',
    refreshToken: 'r',
    isAuthenticated: true,
  });
});

interface Row {
  id: number;
  description: string;
  amount: number;
  transaction_type: string;
}

const rows = (count: number, offset = 0): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: offset + i + 1,
    description: `Item ${offset + i + 1}`,
    amount: 10,
    date: `2026-03-${String((i % 28) + 1).padStart(2, '0')}T00:00:00`,
    currency_code: 'USD',
    transaction_type: 'expense',
    category: { id: 1, name: 'Food' },
    account: { id: 1, name: 'Checking' },
  })) as unknown as Row[];

/**
 * Serves 120 rows across 3 pages of 50, with a summary describing all 120 —
 * the distinction the page has to get right.
 */
function mockPagedBackend(captured: URL[] = []) {
  server.use(
    http.get(`${BASE}/api/v1/transactions/`, ({ request }) => {
      const url = new URL(request.url);
      captured.push(url);

      const perPage = Number(url.searchParams.get('per_page') ?? 50);
      const page = Number(url.searchParams.get('page') ?? 1);
      const type = url.searchParams.get('type');
      const search = url.searchParams.get('search');

      // The server owns filtering now; mirror that so the page cannot pass by
      // filtering client-side.
      // Income is non-zero so the three cards hold three different values —
      // with income at 0, Total Expenses and Net Balance both read −$1,200.00
      // and an assertion on either is ambiguous.
      let total = 120;
      let income = 300;
      let expense = 1200;
      if (type === 'income') {
        total = 4;
        income = 400;
        expense = 0;
      }
      if (search) {
        total = 2;
        expense = 20;
      }

      const start = (page - 1) * perPage;
      const count = Math.max(0, Math.min(perPage, total - start));

      return HttpResponse.json({
        success: true,
        transactions: rows(count, start),
        summary: {
          total_income: income,
          total_expense: expense,
          net_balance: income - expense,
        },
        pagination: {
          page,
          per_page: perPage,
          total,
          pages: Math.ceil(total / perPage),
          has_next: start + count < total,
          has_prev: page > 1,
        },
      });
    })
  );
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <Transactions />
    </MemoryRouter>
  );

describe('Transactions page', () => {
  it('renders one page of rows, not the whole history', async () => {
    mockPagedBackend();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Item 1')).toBeInTheDocument();
    });

    // 50 on screen out of 120 that match.
    expect(screen.getAllByLabelText('Delete transaction')).toHaveLength(50);
    expect(screen.getByText('Item 50')).toBeInTheDocument();
    expect(screen.queryByText('Item 51')).not.toBeInTheDocument();
  });

  it('says which rows are shown and how many match in total', async () => {
    mockPagedBackend();
    renderPage();

    // A bare "(50)" would read as the whole history.
    await waitFor(() => {
      expect(screen.getByText('Transactions 1–50 of 120')).toBeInTheDocument();
    });
  });

  it('shows totals for every matching row, not just the page', async () => {
    mockPagedBackend();
    renderPage();

    // 120 rows at 10.00 = 1,200.00 spent — the page holds 50 of them, worth
    // 500.00. The sign is U+2212 MINUS, not a hyphen: `formatMoney` uses it so
    // negative rows stay aligned in a tabular column.
    await waitFor(() => {
      expect(screen.getByText('\u2212$1,200.00')).toBeInTheDocument();
    });
    expect(screen.getByText('+$300.00')).toBeInTheDocument();
    expect(screen.getByText('\u2212$900.00')).toBeInTheDocument();
    // The page's own 50 rows total 500.00; nothing should be reporting that.
    expect(screen.queryByText('\u2212$500.00')).not.toBeInTheDocument();
  });

  it('asks the server for the next page', async () => {
    const captured: URL[] = [];
    mockPagedBackend(captured);
    renderPage();

    await waitFor(() => expect(screen.getByText('Page 1 of 3')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(screen.getByText('Page 2 of 3')).toBeInTheDocument());
    expect(captured.some((url) => url.searchParams.get('page') === '2')).toBe(true);
    expect(screen.getByText('Item 51')).toBeInTheDocument();
    expect(screen.getByText('Transactions 51–100 of 120')).toBeInTheDocument();
  });

  it('sends the type filter to the server instead of filtering locally', async () => {
    const captured: URL[] = [];
    mockPagedBackend(captured);
    renderPage();

    await waitFor(() => expect(screen.getByText('Item 1')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Income' }));

    await waitFor(() =>
      expect(captured.some((url) => url.searchParams.get('type') === 'income')).toBe(true)
    );
    // And the cards follow the filter rather than describing all time. With no
    // expenses in the filtered set, Total Income and Net Balance both read
    // +$400.00, so this counts rather than expecting one.
    await waitFor(() => expect(screen.getAllByText('+$400.00').length).toBeGreaterThan(0));
    expect(screen.queryByText('\u2212$1,200.00')).not.toBeInTheDocument();
  });

  it('sends the search term to the server', async () => {
    const captured: URL[] = [];
    mockPagedBackend(captured);
    renderPage();

    await waitFor(() => expect(screen.getByText('Item 1')).toBeInTheDocument());

    await userEvent.type(
      screen.getByPlaceholderText('Search transactions...'),
      'coffee'
    );

    await waitFor(
      () =>
        expect(captured.some((url) => url.searchParams.get('search') === 'coffee')).toBe(
          true
        ),
      { timeout: 2000 }
    );
  });

  it('hides the pager when everything fits on one page', async () => {
    server.use(
      http.get(`${BASE}/api/v1/transactions/`, () =>
        HttpResponse.json({
          success: true,
          transactions: rows(3),
          summary: { total_income: 0, total_expense: 30, net_balance: -30 },
          pagination: {
            page: 1,
            per_page: 50,
            total: 3,
            pages: 1,
            has_next: false,
            has_prev: false,
          },
        })
      )
    );
    renderPage();

    await waitFor(() => expect(screen.getByText('Item 1')).toBeInTheDocument());
    expect(screen.getByText('All Transactions (3)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });
});
