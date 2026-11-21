/**
 * Dashboard C, core edition (approved by Harun 2026-11-20): the hero, the cards under it, and what left the page.
 *
 * - The hero's four figures are the SAME server figures and labels the tiles drew (`/analytics/dashboard`), and the
 *   savings rate is the server's `current_month_savings_rate`, never worked out in the browser.
 * - The lesson slot (This week) sits directly below the hero, never inside it.
 * - Cash Flow, the Monthly Expense Breakdown and the page-guide tips card are gone; the "?" stays.
 * - Budgets draw the server's pace mark only where the overview says it applies.
 * - Goals take the server's `progress`, rust for a debt; the range draws one marker per goal at that progress.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useGuideStore } from '../../store/guideStore';
import Dashboard from '../../pages/Dashboard';

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: any) => children,
}));

beforeAll(() => { api.defaults.adapter = 'http'; });

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'alex@test.com', name: 'Alex Demo', default_currency_code: 'USD' } as any,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});

const row = (id: number, name: string, amount: number, spent: number, pace_applies = true) => ({
  id, name: null, amount, spent, remaining: amount - spent, percentage: (spent / amount) * 100, period: 'monthly',
  pace_applies, category: { id, name },
});

function mock({ thisWeek = true, members = [] as Array<{ id: string; name: string }> } = {}) {
  server.use(
    http.get('*/api/v1/team/members', () => HttpResponse.json(members.map((m) => ({ ...m, email: m.id, role: 'member', joinedAt: '2026-01-01' })))),
    http.get('*/api/v1/modules/hard-month', () => HttpResponse.json({ success: true, opening: null })),
    http.get('*/api/v1/learnpal/recall', () => HttpResponse.json({ enabled: false, recall: null })),
    http.get('*/api/v1/analytics/dashboard', () => HttpResponse.json({
      success: true,
      data: { net_worth: -3521.8, current_month_income: 4750, current_month_expenses_only: 2715.7, expenses: [],
        current_month_savings_rate: 42.83 },
    })),
    http.get('*/api/v1/accounts', () => HttpResponse.json({ success: true, accounts: [
      { id: 1, name: 'Primary Checking', account_type: 'checking', balance: 5000, currency_code: 'USD' },
      { id: 2, name: 'Visa Credit Card', account_type: 'credit', balance: -800, currency_code: 'USD' },
    ] })),
    http.get('*/api/v1/budgets/overview', () => HttpResponse.json({
      success: true, budgets: [],
      pace: { fraction: 0.6667, day: 20, days_in_month: 30, as_of: '2026-11-20' },
      groups: [
        { spending_type: 'fixed', budgets: [row(1, 'Housing', 2000, 1800)] },
        { spending_type: 'flexible', budgets: [row(2, 'Food & Dining', 500, 316.17), row(3, 'Shopping', 400, 157.12)] },
        { spending_type: 'non_monthly', budgets: [row(4, 'Car insurance', 1200, 1100, false)] },
      ],
      unsorted: { count: 0, actual: 0, categories: [], budget_count: 0, budgets: [] },
    })),
    http.get('*/api/v1/goals', () => HttpResponse.json({ success: true, goals: [
      { id: 1, name: 'Emergency fund', target_amount: 16000, current_amount: 8000, start_amount: 2000,
        direction: 'accumulate', progress: 0.375, kind: 'savings',
        peak: { scale: 'build', magnitude: 8000, size: 16000, unmeasured: false, band: 4,
          mountain: { slug: 'aconcagua', name: 'Aconcagua', elevation_m: 6961 } } },
      { id: 2, name: 'Pay off the Visa', target_amount: 0, current_amount: -800, start_amount: -1650,
        direction: 'paydown', progress: 0.5152, kind: 'payoff',
        peak: { scale: 'cost', magnitude: 13.33, size: 1650, unmeasured: false, band: 1, apr: 19.99,
          mountain: { slug: 'ben-nevis', name: 'Ben Nevis', elevation_m: 1345 } } },
    ] })),
    http.get('*/api/v1/learnpal/this-week', () => HttpResponse.json(thisWeek ? {
      enabled: true,
      lesson: { id: 'fixed-share', skill: 'fixed-costs', card: 'Some of November is already decided.',
        action: { label: 'Sort your budget lines', href: '/budgets' } },
      week: { start: '2026-11-16', end: '2026-11-22' },
    } : { enabled: false, lesson: null })),
    http.get('*/api/v1/learnpal/skills-progress', () => HttpResponse.json({ enabled: true, skills: [
      { id: 'read-your-month', title: 'Read your month', marks: { understood: false, used: false, remembered: false } },
      { id: 'fixed-costs', title: 'Know your fixed costs', marks: { understood: true, used: false, remembered: false } },
      { id: 'buffer', title: 'Build a buffer', marks: { understood: false, used: true, remembered: false } },
      { id: 'interest', title: 'Understand interest', marks: { understood: false, used: false, remembered: false } },
      { id: 'non-monthly', title: 'Plan for non-monthly costs', marks: { understood: false, used: false, remembered: false } },
      { id: 'pay-down', title: 'Pay down debt', marks: { understood: false, used: false, remembered: false } },
    ] })),
  );
}

const renderPage = () => render(<MemoryRouter><ThemeProvider><Dashboard /></ThemeProvider></MemoryRouter>);

describe('Dashboard C (core): the hero', () => {
  it('draws the same four server figures under the same labels, in the hero', async () => {
    mock();
    renderPage();
    const hero = await screen.findByTestId('dashboard-hero');
    await waitFor(() => expect(within(hero).getByText('Net Worth')).toBeInTheDocument());
    const figures = within(hero).getByTestId('page-totals');
    expect(within(figures).getByText('Monthly Income')).toBeInTheDocument();
    expect(within(figures).getByText('Monthly Expenses')).toBeInTheDocument();
    expect(within(figures).getByText('Savings Rate')).toBeInTheDocument();
    expect(figures.textContent).toContain('3,521.80');
    expect(within(figures).getByText('$4,750.00')).toBeInTheDocument();
    expect(within(figures).getByText('$2,715.70')).toBeInTheDocument();
    expect(within(figures).getByText('43%')).toBeInTheDocument();
    // Net worth keeps a visible window note; the month notes are said once, by the pill (screen reader only here).
    expect(within(figures).getByText('Accounts and investments').className).not.toContain('sr-only');
    expect(within(figures).getAllByText(/so far$/).every((n) => n.className === 'sr-only')).toBe(true);
  });

  it('reads the savings rate from the server, not from the two figures beside it', async () => {
    mock();
    server.use(http.get('*/api/v1/analytics/dashboard', () => HttpResponse.json({ success: true, data: {
      net_worth: 0, current_month_income: 4750, current_month_expenses_only: 2715.7, expenses: [],
      current_month_savings_rate: -12.4 } })));
    renderPage();
    const hero = await screen.findByTestId('dashboard-hero');
    await waitFor(() => expect(within(hero).getByText('-12%')).toBeInTheDocument());
    expect(within(hero).queryByText('43%')).toBeNull();
    expect(within(hero).getByText('You spent more than you earned this month')).toBeInTheDocument();
  });

  it('no rate from the server is a dash, never 0%', async () => {
    mock();
    server.use(http.get('*/api/v1/analytics/dashboard', () => HttpResponse.json({ success: true, data: {
      net_worth: 0, current_month_income: 0, current_month_expenses_only: 40, expenses: [],
      current_month_savings_rate: null } })));
    renderPage();
    const hero = await screen.findByTestId('dashboard-hero');
    await waitFor(() => expect(within(hero).getByText('No income recorded this month. Add it when you have it.')).toBeInTheDocument());
    expect(within(hero).queryByText('0%')).toBeNull();
  });

  it('a member change keeps the page (no loading state), keeps focus on the filter and moves the figures', async () => {
    mock({ members: [{ id: 'a@test.com', name: 'Alice' }, { id: 'b@test.com', name: 'Bob' }] });
    renderPage();
    const filter = await screen.findByLabelText('Show figures for');
    filter.focus();
    server.use(http.get('*/api/v1/analytics/dashboard', () => HttpResponse.json({ success: true, data: {
      net_worth: 1000, current_month_income: 100, current_month_expenses_only: 50, expenses: [],
      current_month_savings_rate: 50 } })));
    fireEvent.change(filter, { target: { value: 'b@test.com' } });
    expect(screen.queryByText('Loading dashboard...')).toBeNull();
    expect(screen.getByTestId('dashboard-hero')).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByTestId('dashboard-hero')).getByText('$1,000.00')).toBeInTheDocument());
    expect(document.activeElement).toBe(screen.getByLabelText('Show figures for'));
  });

  it('greets by the time of day, as the page h1, and keeps the scope line', async () => {
    mock();
    renderPage();
    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1.textContent).toMatch(/^Good (morning|afternoon|evening), Alex$/);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Everyone sharing this finPal instance')).toBeInTheDocument();
    expect(screen.getByTestId('page-hero-pill').textContent).toMatch(/so far$/);
  });

  it('shows This week directly below the hero, never inside it', async () => {
    mock();
    renderPage();
    const card = await screen.findByTestId('this-week-card');
    expect(screen.getByTestId('dashboard-hero').contains(card)).toBe(false);
    expect(screen.getByTestId('dashboard-lesson').contains(card)).toBe(true);
  });

  it('draws the range as the hero art (not the plain ridge), each goal with a marker at its server progress', async () => {
    mock();
    renderPage();
    const hero = await screen.findByTestId('dashboard-hero');
    await waitFor(() => expect(within(hero).getByTestId('goal-range')).toBeInTheDocument());
    expect(hero.querySelectorAll('[data-testid="range-peak"]')).toHaveLength(2);
    expect(within(hero).queryByTestId('hero-ridge')).toBeNull();
    const marks = [...hero.querySelectorAll('[data-testid="goal-progress-mark"]')].map((m) => m.getAttribute('data-progress'));
    expect(marks.sort()).toEqual(['0.375', '0.515']);
    // The tallest unfinished goal says how far up in words, from the same figure.
    expect(hero.textContent).toContain('Emergency fund · 38% up');
  });
});

describe('Dashboard C (core): what left the page', () => {
  it('has no Cash Flow chart, no Monthly Expense Breakdown and no tips card; the month links to Transactions', async () => {
    mock();
    useGuideStore.setState({ status: 'ready', dismissed: [], reopened: null, touring: null } as any);
    renderPage();
    await screen.findByTestId('dashboard-hero');
    await waitFor(() => expect(screen.getByTestId('where-month-went')).toBeInTheDocument());
    expect(screen.queryByText('Cash Flow')).not.toBeInTheDocument();
    expect(screen.queryByText('Monthly Expense Breakdown')).not.toBeInTheDocument();
    expect(document.querySelector('[data-guide-card="dashboard"]')).toBeNull();
    expect(screen.getByTestId('see-every-transaction').getAttribute('href')).toBe('/transactions');
    expect(screen.queryByTestId('skills-card')).not.toBeInTheDocument();
  });
});

describe('Dashboard C (core): the cards', () => {
  it('with Learn switched off there is no skills card and no empty column', async () => {
    mock();
    server.use(http.get('*/api/v1/learnpal/skills-progress', () => HttpResponse.json({ enabled: false, skills: [] })));
    renderPage();
    const month = await screen.findByTestId('where-month-went');
    expect(screen.queryByTestId('skills-compact')).toBeNull();
    expect(month.closest('.fp-dash-row')!.className).toContain('is-single');
  });

  it("Where the month went: the hero's out, \"out of\" the hero's in", async () => {
    mock();
    renderPage();
    const card = await screen.findByTestId('where-month-went');
    await waitFor(() => expect(within(card).getByText('$2,715.70')).toBeInTheDocument());
    expect(within(card).getByText('out of $4,750.00 that came in')).toBeInTheDocument();
  });

  it('Your skills: started skills as chips, the rest counted, one link to all six', async () => {
    mock();
    renderPage();
    const card = await screen.findByTestId('skills-compact');
    expect(within(card).getAllByTestId('skill-chip-row')).toHaveLength(2);
    expect(within(card).getByText('Know your fixed costs · This week')).toBeInTheDocument();
    expect(within(card).getByText('Understood')).toBeInTheDocument();
    expect(within(card).getByText('Used on your money')).toBeInTheDocument();
    expect(within(card).getAllByRole('link')).toHaveLength(1);
    expect(within(card).getByText('4 more to start')).toBeInTheDocument();
    expect(within(card).getByTestId('skills-see-all').getAttribute('href')).toBe('/learnpal');
  });

  it('Budgets: top three, the pace mark only where the server says it applies', async () => {
    mock();
    renderPage();
    const card = await screen.findByTestId('budgets-card');
    await waitFor(() => expect(within(card).getByText('Housing')).toBeInTheDocument());
    expect(within(card).getByText('Car insurance')).toBeInTheDocument();
    expect(within(card).queryByText('Shopping')).not.toBeInTheDocument();
    expect(card.querySelectorAll('[data-testid="pace-mark"]')).toHaveLength(2);
    expect((card.querySelector('[data-testid="pace-mark"]') as HTMLElement).style.left).toBe('66.67%');
    expect(within(card).getByTestId('pace-note').textContent).toBe('The line is where you would be by day 20.');
  });

  it('Accounts: type under the name, a debt in rust with its sign', async () => {
    mock();
    renderPage();
    const card = await screen.findByTestId('accounts-card');
    await waitFor(() => expect(within(card).getByText('Visa Credit Card')).toBeInTheDocument());
    expect(within(card).getByText('Credit card')).toBeInTheDocument();
    const owed = within(card).getByText('−$800.00');
    expect(owed.getAttribute('data-owed')).toBe('true');
  });

  it("Goals: the server's progress and the goal's own words, rust for a debt", async () => {
    mock();
    renderPage();
    const card = await screen.findByTestId('goals-card');
    await waitFor(() => expect(within(card).getAllByTestId('goal-line')).toHaveLength(2));
    const [save, debt] = within(card).getAllByTestId('goal-line');
    expect(save.querySelector('[data-testid="goal-fill"]')!.getAttribute('data-width')).toBe('37.5%');
    expect(debt.getAttribute('data-direction')).toBe('paydown');
    expect(debt.querySelector('[data-testid="goal-fill"]')!.getAttribute('data-colour')).toBe('var(--peak-cost)');
  });
});
