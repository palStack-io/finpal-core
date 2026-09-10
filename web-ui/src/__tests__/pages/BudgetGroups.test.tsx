/**
 * The budget page's three groups, its Unsorted section and Left to budget.
 *
 * *** ASSERT ON RENDERED FIGURES, NOT ON THE PRESENCE OF A SECTION. *** A group
 * that renders with the wrong number renders perfectly, and every bug this
 * project has found across eight sessions returned 200 and looked fine.
 *
 * The fixtures use DELIBERATELY LONG category names. A name that fits at 1440
 * and overflows at 390 is the whole point of having a fixture at all, and short
 * ones cannot produce that.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

const LONG_FIXED = 'Rent, service charge and ground rent for the flat';
const LONG_FLEX = 'Groceries, household supplies and everything from the corner shop';
const LONG_UNSORTED = 'Gym membership and physiotherapy appointments';

const budgetRow = (id: number, name: string, amount: number, spent: number) => ({
  id,
  name,
  amount,
  spent,
  remaining: amount - spent,
  percentage: amount > 0 ? (spent / amount) * 100 : 0,
  category_id: id + 100,
  category_name: name,
  category_icon: '🏷️',
  category_color: '#6c757d',
  period: 'monthly',
  is_active: true,
  user_id: 'alice@test.com',
});

const overview = (extra: Record<string, unknown> = {}) => ({
  success: true,
  total_budget: 1720,
  total_spent: 1373,
  total_remaining: 347,
  percentage_used: 79.8,
  budget_count: 3,
  budgets: [
    budgetRow(1, LONG_FIXED, 1000, 1000),
    budgetRow(2, LONG_FLEX, 600, 723),
    budgetRow(3, 'Presents and seasonal giving', 120, 40),
  ],
  groups: [
    {
      spending_type: 'fixed',
      label: 'Fixed',
      planned: 1000,
      actual: 1000,
      remaining: 0,
      budgets: [budgetRow(1, LONG_FIXED, 1000, 1000)],
    },
    {
      spending_type: 'flexible',
      label: 'Flexible',
      planned: 600,
      actual: 723,
      remaining: -123,
      budgets: [budgetRow(2, LONG_FLEX, 600, 723)],
    },
    {
      spending_type: 'non_monthly',
      label: 'Non-Monthly',
      planned: 120,
      actual: 40,
      remaining: 80,
      budgets: [budgetRow(3, 'Presents and seasonal giving', 120, 40)],
    },
  ],
  unsorted: {
    count: 2,
    actual: 210,
    categories: [
      { id: 901, name: LONG_UNSORTED, actual: 180 },
      { id: 902, name: 'Bank fees', actual: 30 },
    ],
    budget_count: 0,
    budgets: [],
  },
  totals: { planned: 1720, actual: 1583, remaining: 137 },
  income: 4000,
  left_to_budget: 2280,
  ...extra,
});

/**
 * *** SCOPE EVERY QUERY TO A HEADING. *** 'Fixed', 'Flexible', 'Non-Monthly' and
 * 'Unsorted' each appear FIVE more times than you expect, as <option> elements
 * inside every SpendingTypeControl. A bare getByText finds six matches and the
 * first draft of this file failed nine ways for that one reason.
 */
const heading = (name: string) => screen.findByRole('heading', { level: 2, name });

/** The <section> a group heading lives in, so figures can be read from it. */
const sectionFor = async (name: string) =>
  (await heading(name)).closest('section') as HTMLElement;

const mount = (body: Record<string, unknown>) => {
  server.use(
    http.get('*/api/v1/budgets/overview', () => HttpResponse.json(body)),
    http.get('*/api/v1/categories/', () => HttpResponse.json({ categories: [] })),
    http.get('*/api/v1/categories', () => HttpResponse.json({ categories: [] })),
    http.get('*/api/v1/transactions*', () => HttpResponse.json({
      transactions: [], has_next: false, page: 1, pages: 1, total: 0,
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

describe('Budgets page groups', () => {
  it('renders all three group headings in order', async () => {
    mount(overview());
    await heading('Fixed');
    const headings = screen.getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    // The budget cards contribute h2s too, so assert on ORDER, not on equality.
    expect(headings.indexOf('Fixed')).toBeGreaterThanOrEqual(0);
    expect(headings.indexOf('Fixed')).toBeLessThan(headings.indexOf('Flexible'));
    expect(headings.indexOf('Flexible')).toBeLessThan(headings.indexOf('Non-Monthly'));
  });

  it('renders the SERVER subtotal, not one it summed itself', async () => {
    // The server says the flexible group's actual is 723. If the page ever
    // starts deriving this, a payload whose parts disagree with its total will
    // expose it -- which is the whole reason the server owns the figure.
    mount(overview({
      groups: overview().groups.map((g: any) => (
        g.spending_type === 'flexible' ? { ...g, actual: 999 } : g
      )),
    }));
    const section = await sectionFor('Flexible');
    // Money splits sign/symbol/digits into separate nodes, so read the text.
    expect(section.textContent).toContain('999');
  });

  it('shows a negative remaining rather than clamping it to zero', async () => {
    mount(overview());
    const section = await sectionFor('Flexible');
    // -123 somewhere in the group header, and NOT a 0.
    expect(section.textContent).toMatch(/[-\u2212]\s?\$?123/);
  });

  it('paints a negative remaining in the over-budget token, not the ok one', async () => {
    mount(overview());
    const section = await sectionFor('Flexible');
    const negative = within(section).getByText((_, node) => (
      node?.children.length === 0 && /[-\u2212]\s?\$?123/.test(node?.textContent ?? '')
    ));
    expect(negative.getAttribute('style')).toContain('var(--status-over)');
  });

  it('shows the Unsorted section with its count when categories are unclassified', async () => {
    mount(overview());
    const section = await sectionFor('Unsorted');
    expect(within(section).getByText('2')).toBeTruthy();
    expect(within(section).getByText(LONG_UNSORTED)).toBeTruthy();
    expect(within(section).getByText('Bank fees')).toBeTruthy();
    expect(section.textContent).toContain('180');
  });

  it('hides the Unsorted section entirely when nothing is unsorted', async () => {
    mount(overview({
      unsorted: { count: 0, actual: 0, categories: [], budget_count: 0, budgets: [] },
    }));
    await heading('Fixed');
    expect(screen.queryByRole('heading', { level: 2, name: 'Unsorted' })).toBeNull();
  });

  it('renders Left to budget when income is known', async () => {
    mount(overview());
    expect(await screen.findByText('Left to budget')).toBeTruthy();
    expect(screen.getByText(/\$2,280/)).toBeTruthy();
  });

  it('says income is unknown rather than showing 0 when it is null', async () => {
    // *** THE DEMO'S ACTUAL SHAPE. *** Rendering null as 0 would print
    // "-$1,720 left to budget" to somebody who has not been paid yet.
    mount(overview({ income: null, left_to_budget: null }));
    expect(await screen.findByText('Left to budget')).toBeTruthy();
    expect(screen.getByText('No income recorded this month yet')).toBeTruthy();
    // An em dash, not a figure. Zero would be a claim they earned nothing.
    expect(screen.getByText('\u2014')).toBeTruthy();
  });

  it('does not ask for a target on a fixed category', async () => {
    // Fixed is reported, not budgeted: the card shows what it costs and does
    // not score it out of a target it cannot respond to.
    mount(overview());
    const section = await sectionFor('Fixed');
    expect(section.textContent).toContain('committed');
    expect(section.textContent).not.toMatch(/of \$1,000/);
    // The flexible card DOES still show its target, so this is the fixed
    // branch and not the section failing to render at all.
    expect(screen.getByText(/of \$600/)).toBeTruthy();
  });

  it('offers a group control on every budget row and in Unsorted', async () => {
    mount(overview());
    await heading('Fixed');
    const controls = await screen.findAllByLabelText('Spending group');
    // three budgets + two unsorted categories
    expect(controls.length).toBe(5);
    expect([...(controls[0] as HTMLSelectElement).options].map((o) => o.text))
      .toEqual(['Fixed', 'Flexible', 'Non-Monthly', 'Unsorted']);
  });

  it('renders an empty group rather than dropping it', async () => {
    mount(overview({
      groups: overview().groups.map((g: any) => (
        g.spending_type === 'non_monthly'
          ? { ...g, planned: 0, actual: 0, remaining: 0, budgets: [] }
          : g
      )),
    }));
    const section = await sectionFor('Non-Monthly');
    expect(within(section).getByText('No non-monthly budgets yet.')).toBeTruthy();
  });
});
