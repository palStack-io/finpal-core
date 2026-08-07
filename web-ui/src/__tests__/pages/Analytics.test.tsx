/**
 * Analytics must not display numbers it did not compute.
 *
 * Every metric card used to receive a hardcoded change string — "+12.5%",
 * "+8.3%", "+15.2%", "+2.1%" on Overview and "+5.2%", "+3.1%", "+8.7%" on Cash
 * Flow — so a brand-new account with no transactions was told its income was up
 * 12.5% on the previous period. The Income Sources pie split total income
 * 75/20/5 across invented "Primary"/"Secondary"/"Other" labels, and four fixed
 * sentences asserted a healthy savings rate and debt ratio regardless of the
 * data.
 *
 * These tests assert on what reaches the screen, because the failure mode was a
 * page that rendered perfectly while being wrong.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { Analytics } from '../../pages/Analytics';

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

/** An account with nothing in it — the case the fabricated numbers hid. */
function mockEmptyBackend() {
  server.use(
    http.get(`${BASE}/api/v1/analytics/categories/top`, () =>
      HttpResponse.json({ success: true, categories: [] })),
    http.get(`${BASE}/api/v1/analytics/cashflow`, () =>
      HttpResponse.json({ success: true, cashflow: [] })),
    http.get(`${BASE}/api/v1/analytics/networth`, () =>
      HttpResponse.json({ success: true, networth: [] })),
    http.get(`${BASE}/api/v1/analytics/health`, () =>
      HttpResponse.json({
        success: true,
        health: {
          totalIncome: 0, totalExpenses: 0, netSavings: 0, savingsRate: 0,
          debtToIncome: 0, emergencyFundMonths: 0, liquidityRatio: 5.0,
          investmentReturn: null,
        },
      })),
  );
}

const renderPage = () =>
  render(<MemoryRouter><Analytics /></MemoryRouter>);

describe('Analytics — no fabricated figures', () => {
  it('shows no invented percentage deltas on an empty account', async () => {
    mockEmptyBackend();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Total Income')).toBeInTheDocument();
    });

    // The exact literals that used to be hardcoded.
    for (const fake of ['+12.5%', '+8.3%', '+15.2%', '+2.1%']) {
      expect(screen.queryByText(new RegExp(fake.replace('+', '\\+')))).toBeNull();
    }
  });

  it('says there is no baseline rather than printing a zero delta', async () => {
    mockEmptyBackend();
    renderPage();

    await waitFor(() => {
      expect(
        screen.getAllByText(/No previous period to compare/).length,
      ).toBeGreaterThan(0);
    });
  });

  it('does not invent a Primary/Secondary/Other income split', async () => {
    mockEmptyBackend();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Total Income')).toBeInTheDocument();
    });

    expect(screen.queryByText('Primary Income')).toBeNull();
    expect(screen.queryByText('Secondary Income')).toBeNull();
  });

  it('derives income categories from the backend instead of a fixed ratio', async () => {
    server.use(
      http.get(`${BASE}/api/v1/analytics/categories/top`, ({ request }) => {
        const type = new URL(request.url).searchParams.get('type');
        if (type === 'income') {
          return HttpResponse.json({
            success: true,
            categories: [
              { name: 'Salary', amount: 4000, color: null, icon: null },
              { name: 'Dividends', amount: 250, color: null, icon: null },
            ],
          });
        }
        return HttpResponse.json({ success: true, categories: [] });
      }),
      http.get(`${BASE}/api/v1/analytics/cashflow`, () =>
        HttpResponse.json({ success: true, cashflow: [] })),
      http.get(`${BASE}/api/v1/analytics/networth`, () =>
        HttpResponse.json({ success: true, networth: [] })),
      http.get(`${BASE}/api/v1/analytics/health`, () =>
        HttpResponse.json({
          success: true,
          health: {
            totalIncome: 4250, totalExpenses: 0, netSavings: 4250, savingsRate: 100,
            debtToIncome: 0, emergencyFundMonths: 0, liquidityRatio: 5.0,
            investmentReturn: null,
          },
        })),
    );

    renderPage();

    // Real total from the real categories: 4000 + 250. It appears twice here —
    // Total Income and, with no expenses, Net Savings.
    await waitFor(() => {
      expect(screen.getAllByText('$4,250.00').length).toBeGreaterThan(0);
    });

    // And nowhere near the 75% of 4250 (= 3187.50) the old fixed split produced.
    expect(screen.queryByText(/3,187/)).toBeNull();
  });

  it('sends the selected range and direction to the backend', async () => {
    const seen: Array<Record<string, string | null>> = [];
    server.use(
      http.get(`${BASE}/api/v1/analytics/categories/top`, ({ request }) => {
        const p = new URL(request.url).searchParams;
        seen.push({
          type: p.get('type'),
          start_date: p.get('start_date'),
          end_date: p.get('end_date'),
        });
        return HttpResponse.json({ success: true, categories: [] });
      }),
      http.get(`${BASE}/api/v1/analytics/cashflow`, () =>
        HttpResponse.json({ success: true, cashflow: [] })),
      http.get(`${BASE}/api/v1/analytics/networth`, () =>
        HttpResponse.json({ success: true, networth: [] })),
      http.get(`${BASE}/api/v1/analytics/health`, () =>
        HttpResponse.json({
          success: true,
          health: {
            totalIncome: 0, totalExpenses: 0, netSavings: 0, savingsRate: 0,
            debtToIncome: 0, emergencyFundMonths: 0, liquidityRatio: 5.0,
            investmentReturn: null,
          },
        })),
    );

    renderPage();

    await waitFor(() => expect(seen.length).toBe(4));

    // Both directions, over two distinct windows (current and prior).
    expect(seen.filter(s => s.type === 'income')).toHaveLength(2);
    expect(seen.filter(s => s.type === 'expense')).toHaveLength(2);
    expect(new Set(seen.map(s => s.start_date)).size).toBe(2);
    for (const s of seen) {
      expect(s.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('surfaces a load failure instead of rendering zeroes', async () => {
    server.use(
      http.get(`${BASE}/api/v1/analytics/categories/top`, () =>
        HttpResponse.json({ success: false }, { status: 500 })),
      http.get(`${BASE}/api/v1/analytics/cashflow`, () =>
        HttpResponse.json({ success: true, cashflow: [] })),
      http.get(`${BASE}/api/v1/analytics/networth`, () =>
        HttpResponse.json({ success: true, networth: [] })),
      http.get(`${BASE}/api/v1/analytics/health`, () =>
        HttpResponse.json({ success: false }, { status: 500 })),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Could not load analytics/);
    });
  });
});
