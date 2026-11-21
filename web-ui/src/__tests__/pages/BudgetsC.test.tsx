/**
 * Budgets C, core edition (Harun's pick, 2026-11-20): the hero, the lesson line, the rows and the ⋯.
 *
 * Every figure the hero prints is the SERVER's: the big number is `totals.remaining` (the fixture below makes it a
 * number no client sum of the rows could produce), the days and the per-day figure are the overview's `days_left` and
 * `per_day` printed as sent, and the month is `pace.as_of`, never the browser clock.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import BudgetsMinimal from '../../pages/BudgetsMinimal';

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: any) => children,
}));

const TODAY = new Date();
const AS_OF = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}-20`;
const MONTH = new Date(TODAY.getFullYear(), TODAY.getMonth(), 20).toLocaleDateString('en-US', { month: 'long' });

const row = (id: number, name: string, amount: number, spent: number, extra: Record<string, unknown> = {}) => ({
  id, name, amount, spent, remaining: amount - spent, percentage: amount > 0 ? (spent / amount) * 100 : 0,
  category_id: id + 100, category: { id: id + 100, name }, period: 'monthly', is_active: true, pace_applies: true,
  user_id: 'alice@test.com', ...extra,
});

const overview = (extra: Record<string, unknown> = {}) => ({
  success: true,
  budgets: [row(1, 'Rent', 1500, 1500), row(2, 'Groceries', 600, 250), row(3, 'Dining out', 200, 260)],
  groups: [
    { spending_type: 'fixed', label: 'Fixed', planned: 1500, actual: 1500, remaining: 0, budgets: [row(1, 'Rent', 1500, 1500)],
      unbudgeted_actual: 0, unbudgeted_categories: [] },
    { spending_type: 'flexible', label: 'Flexible', planned: 800, actual: 510, remaining: 290,
      budgets: [row(2, 'Groceries', 600, 250), row(3, 'Dining out', 200, 260)],
      unbudgeted_actual: 85.44, unbudgeted_categories: [{ id: 77, name: 'Pharmacy', actual: 85.44 }] },
    { spending_type: 'non_monthly', label: 'Non-Monthly', planned: 0, actual: 0, remaining: 0, budgets: [],
      unbudgeted_actual: 0, unbudgeted_categories: [] },
  ],
  unsorted: { count: 0, actual: 0, categories: [], budget_count: 0, budgets: [] },
  // 769.74 is the server's figure; no sum of the rows above gives it.
  totals: { planned: 3400, actual: 2715.7, budgeted_actual: 2630.26, unbudgeted_actual: 85.44, remaining: 769.74 },
  income: 4750, left_to_budget: 1350,
  pace: { fraction: 0.6667, day: 20, days_in_month: 30, as_of: AS_OF },
  days_left: 11, per_day: 69.98,
  ...extra,
});

const mount = (body: Record<string, unknown>, why: Record<string, unknown> = { enabled: false, cards: [] }) => {
  server.use(
    http.get('*/api/v1/budgets/overview', () => HttpResponse.json(body)),
    http.get('*/api/v1/categories/', () => HttpResponse.json({ categories: [] })),
    http.get('*/api/v1/categories', () => HttpResponse.json({ categories: [] })),
    http.get('*/api/v1/transactions*', () => HttpResponse.json({ transactions: [], has_next: false, page: 1, pages: 1, total: 0 })),
    http.get('*/api/v1/team/members', () => HttpResponse.json([])),
    http.get('*/api/v1/modules/hard-month', () => HttpResponse.json({ success: true, opening: null })),
    http.get('*/api/v1/learnpal/why', () => HttpResponse.json(why)),
    http.get('*/api/v1/learnpal/short/:id', () => HttpResponse.json({
      id: 'fixed-share', try: { kind: 'fixed_share', income: '4750.00', fixed_amount: '1500.00', share_percent: '31.6' },
    })),
  );
  return render(<MemoryRouter><BudgetsMinimal /></MemoryRouter>);
};

beforeAll(() => { api.defaults.adapter = 'http'; });
beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'alice@test.com', name: 'Alice', default_currency_code: 'USD' } as any,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});
afterEach(() => { server.resetHandlers(); });

describe('Budgets C (core): the hero', () => {
  it("prints the server's remaining, days and per-day as sent", async () => {
    mount(overview());
    const hero = await screen.findByTestId('budgets-hero');
    expect(within(hero).getByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument();
    expect(within(hero).getByTestId('budgets-big-number').textContent).toBe('$769.74');
    expect(hero.textContent).toContain('left to spend, with 11 days to go');
    expect(within(hero).getByTestId('budgets-hero-line').textContent)
      .toBe(`That is about $69.98 a day for the rest of ${MONTH}.`);
    // The plan bar is the budgeted slice of the plan; all spending is still said in words.
    expect(hero.textContent).toContain('$2,630.26 spent of $3,400.00 planned');
    expect(hero.textContent).toContain('$85.44 more went to categories with no budget');
    expect(hero.textContent).toContain('Day 20 of 30');
    expect(within(hero).getByText('Came in')).toBeInTheDocument();
    expect(within(hero).getByText('Not given a job yet')).toBeInTheDocument();
    // Every hero carries the silhouette: Budgets has no art of its own, so it gets the decorative ridge.
    expect(within(hero).getByTestId('hero-ridge').getAttribute('aria-hidden')).toBe('true');
  });

  it('on the last day says so instead of a per-day figure', async () => {
    mount(overview({ days_left: 1, per_day: 769.74 }));
    const hero = await screen.findByTestId('budgets-hero');
    expect(hero.textContent).toContain('left to spend, and today is the last day');
    expect(within(hero).getByTestId('budgets-hero-line').textContent).toBe(`Today is the last day of ${MONTH}.`);
  });

  it('past the plan: the amount past it, said in words, and no per-day', async () => {
    mount(overview({ totals: { planned: 3400, actual: 3500, budgeted_actual: 3500, unbudgeted_actual: 0, remaining: -100 }, per_day: null }));
    const hero = await screen.findByTestId('budgets-hero');
    expect(within(hero).getByTestId('budgets-big-number').textContent).toBe('$100.00');
    expect(hero.textContent).toContain('past the plan this month');
    expect(within(hero).getByTestId('budgets-hero-line').textContent).toContain('is used up');
  });

  it('no plan yet: the first step, and no plan bar', async () => {
    mount(overview({ totals: { planned: 0, actual: 0, budgeted_actual: 0, unbudgeted_actual: 0, remaining: 0 }, per_day: null }));
    const hero = await screen.findByTestId('budgets-hero');
    expect(within(hero).getByTestId('budgets-hero-line').textContent).toContain(`No plan for ${MONTH} yet.`);
    expect(within(hero).queryByTestId('budgets-plan-fill')).toBeNull();
  });

  it('another month says the figures are this month\'s, with no per-day line', async () => {
    mount(overview());
    const hero = await screen.findByTestId('budgets-hero');
    await userEvent.click(within(hero).getByRole('button', { name: 'Previous month' }));
    await waitFor(() => expect(within(screen.getByTestId('budgets-hero')).getByTestId('budgets-hero-line').textContent)
      .toContain(`These figures are for ${MONTH}, this month.`));
    expect(screen.getByTestId('budgets-hero').textContent).not.toContain('a day for the rest of');
    expect(within(screen.getByTestId('budgets-hero')).getByRole('button', { name: 'Today' })).toBeInTheDocument();
  });
});

describe('Budgets C (core): lesson, rows and the ⋯', () => {
  it('draws the Why card as one line directly under the hero, with its small chart', async () => {
    mount(overview(), { enabled: true, cards: [{ id: 'fixed-share', card: 'About a third of what came in is already decided.',
      action: { label: 'See your fixed costs', href: '/budgets' } }] });
    const line = await screen.findByTestId('why-line');
    expect(screen.getByTestId('budgets-hero').nextElementSibling).toBe(line);
    await waitFor(() => expect(within(line).getByTestId('why-line-chart')).toBeInTheDocument());
    expect(within(line).getByText('Fixed 32%')).toBeInTheDocument();
    expect(within(line).getByRole('button', { name: 'Why it matters (1 min)' })).toBeInTheDocument();
  });

  it('no lesson applies: no line at all', async () => {
    mount(overview());
    await screen.findByTestId('budgets-hero');
    expect(screen.queryByTestId('why-line')).toBeNull();
  });

  it('Flexible rows carry a status chip from the server figures and the pace mark', async () => {
    mount(overview());
    const flexible = await screen.findByTestId('bc-flexible');
    expect(within(flexible).getByTestId('budget-chip-2').textContent).toBe('Plenty left');
    const over = within(flexible).getByTestId('budget-chip-3');
    expect(over.textContent).toBe('Over by $60.00');
    expect(over.getAttribute('data-status')).toBe('over');
    expect(flexible.querySelectorAll('.fp-bc-mark')).toHaveLength(2);
    expect(flexible.textContent).toContain('The line on each bar is where you would be by today.');
  });

  it('each row hides its controls behind one ⋯ named for the budget, and Escape hands focus back', async () => {
    mount(overview());
    const button = await screen.findByRole('button', { name: 'Options for Groceries' });
    expect(screen.queryByLabelText('Spending group')).toBeNull();
    await userEvent.click(button);
    expect(screen.getByTestId('budget-menu-2')).toBeInTheDocument();
    expect(screen.getByLabelText('Spending group')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit budget/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete budget/ })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('budget-menu-2')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('the ⋯ shows the row\'s transactions', async () => {
    mount(overview());
    await userEvent.click(await screen.findByRole('button', { name: 'Options for Groceries' }));
    await userEvent.click(screen.getByRole('button', { name: /Show transactions/ }));
    expect(await screen.findByText(/Nothing recorded in this category yet/)).toBeInTheDocument();
  });

  it('Fixed reads "Already decided"; an empty Non-monthly offers to plan one; Not budgeted lists the rest', async () => {
    mount(overview());
    expect((await screen.findByTestId('bc-fixed')).textContent).toContain('Already decided');
    const nonMonthly = screen.getByTestId('bc-non-monthly');
    expect(within(nonMonthly).getByText('No non-monthly budgets yet.')).toBeInTheDocument();
    expect(within(nonMonthly).getByRole('button', { name: 'Plan it' })).toBeInTheDocument();
    const notBudgeted = screen.getByTestId('not-budgeted');
    expect(within(notBudgeted).getByText('Pharmacy')).toBeInTheDocument();
    expect(within(notBudgeted).getByRole('button', { name: 'Budget this' })).toBeInTheDocument();
    // Unsorted is empty, so the server's unbudgeted total is exactly these rows and is printed.
    expect(notBudgeted.querySelector('.fp-bc-card-sub')!.textContent).toContain('85.44');
  });

  it('the tips card never opens on its own; the hero has no health bar and no totals row', async () => {
    mount(overview());
    await screen.findByTestId('budgets-hero');
    expect(document.querySelector('[data-guide-card="budgets"]')).toBeNull();
    expect(screen.queryByTestId('page-totals')).toBeNull();
    expect(screen.queryByText(/Budget Health/i)).toBeNull();
  });
});
