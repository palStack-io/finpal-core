/**
 * *** SPEC §1 DECISION 3: BOTH SCREENS, ONE VALUE. *** The budget page got its
 * control first and the category screen was missed, which mattered more than it
 * sounds: the budget page only lists categories that HAVE a budget, and the
 * Unsorted section only lists ones money left through THIS MONTH. So a category
 * with neither had no reassign path at all, and "the user can always change it"
 * -- the whole reason a default is not an inference (§4) -- was not true of it.
 *
 * Asserts on rendered controls and on the request that leaves, never on a
 * status code.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { CategoryManagement } from '../../components/CategoryManagement';

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: any) => children,
}));

const CATEGORIES = [
  {
    id: 1, name: 'Housing', icon: '🏠', color: '#3498db',
    parent_id: null, is_system: false, spending_type: 'fixed',
  },
  {
    // A subcategory with NO budget and NO spending -- unreachable from the
    // budget page by construction. This is the row the gap was about.
    id: 2, name: 'Home maintenance and occasional repairs', icon: '🔧',
    color: '#3498db', parent_id: 1, is_system: false, spending_type: null,
  },
  {
    id: 3, name: 'Other', icon: '❓', color: '#95a5a6',
    parent_id: null, is_system: true, spending_type: null,
  },
];

let puts: Array<{ id: string; body: any }> = [];

const mount = () => {
  puts = [];
  server.use(
    http.get('*/api/v1/categories', () => HttpResponse.json({ categories: CATEGORIES })),
    http.get('*/api/v1/categories/', () => HttpResponse.json({ categories: CATEGORIES })),
    http.put('*/api/v1/categories/:id', async ({ params, request }) => {
      puts.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json({ message: 'Category updated successfully' });
    }),
  );
  return render(<CategoryManagement />);
};

beforeAll(() => { api.defaults.adapter = 'http'; });
beforeEach(() => { puts = []; });
afterEach(() => { server.resetHandlers(); });

describe('spending group on the category screen', () => {
  it('offers a control on a parent AND on a subcategory', async () => {
    mount();
    const controls = await screen.findAllByLabelText('Spending group');
    expect(controls.length).toBe(3);
  });

  it('shows the group the category is actually in', async () => {
    mount();
    await screen.findAllByLabelText('Spending group');
    const [housing] = screen.getAllByLabelText('Spending group') as HTMLSelectElement[];
    expect(housing.value).toBe('fixed');
  });

  it('shows an unclassified category as Unsorted, not as a blank', async () => {
    mount();
    const controls = await screen.findAllByLabelText('Spending group') as HTMLSelectElement[];
    // The subcategory, which has spending_type null.
    expect(controls[1].value).toBe('');
    expect([...controls[1].options].map((o) => o.text))
      .toEqual(['Fixed', 'Flexible', 'Non-Monthly', 'Unsorted']);
  });

  it('WRITES THE CHANGE THROUGH to PUT /categories/<id>', async () => {
    // *** THE ASSERTION THAT MATTERS. *** A control that renders and saves
    // nothing is exactly the shape of D-182 -- an affordance without the
    // capability behind it.
    mount();
    const controls = await screen.findAllByLabelText('Spending group');
    await userEvent.selectOptions(controls[1], 'non_monthly');

    await waitFor(() => expect(puts.length).toBe(1));
    expect(puts[0].id).toBe('2');
    expect(puts[0].body).toEqual({ spending_type: 'non_monthly' });
  });

  it('can put a category BACK to unsorted, sending null not an empty string', async () => {
    mount();
    const controls = await screen.findAllByLabelText('Spending group');
    await userEvent.selectOptions(controls[0], '');

    await waitFor(() => expect(puts.length).toBe(1));
    expect(puts[0].body).toEqual({ spending_type: null });
  });

  it('offers the control on a SYSTEM category too', async () => {
    // 'Other' cannot be renamed, but it can be classified -- the server
    // exemption is per-field. Hiding the control here would re-create the gap
    // on the demo, where every category is a system category.
    mount();

    /* *** REACHED BY NAME, THROUGH THE FOLD. *** The list sorts by spending
       now and folds categories nothing was spent in (owner, 2026-09-19: the
       page should show where the money went). "Other" has no spend in the
       shared fixture, so it sits behind the disclosure — and addressing it as
       `controls[2]` silently selected a different category's control the
       moment the order changed. The point of this test is that a SYSTEM
       category can still be classified; where it sits is the page's business,
       reaching it is the test's. */
    await userEvent.click(await screen.findByTestId('unused-categories'));

    const card = (await screen.findByText('Other')).closest('div[style]')!
      .parentElement!.parentElement!.parentElement!;
    const control = within(card as HTMLElement).getByLabelText('Spending group');
    await userEvent.selectOptions(control, 'flexible');

    await waitFor(() => expect(puts.length).toBe(1));
    expect(puts[0].id).toBe('3');
  });
});

describe('Categories answers where the money went', () => {
  /* Owner, 2026-09-19: *"the header makes it loook like its for seeing where
     money goes where as the categories page just has categories"*. The page
     already FETCHED the per-category spend and used it only for the split in
     the head — so the header talked about money and the list showed none. */

  it('*** PUTS THE MONEY ON THE ROW, BIGGEST FIRST ***', async () => {
    mount();
    /* Housing is 1,800 in the shared fixture; Other has nothing. Scoped to
       the ROW rather than the page, because the head's Fixed/Flexible split
       prints the same figure — matching either would pass while the list
       still showed no money, which is the defect. */
    const heading = await screen.findByRole('heading', { name: 'Housing' });
    /* *** WAITED FOR, NOT ASSERTED IMMEDIATELY. *** The categories arrive
       first and the spend is a second request, so the row renders once
       WITHOUT money and once with — asserting on the first paint fails
       against correct code. */
    await waitFor(() => expect(heading.parentElement!.textContent).toMatch(/1,800/));
    expect(heading.parentElement!.textContent).toMatch(/% of the month/);
  });

  it('folds what nothing was spent in, and SAYS HOW MANY', async () => {
    /* Pruning an unused category is this page's other job and the only place
       to do it, so they fold rather than disappear — and the count is on the
       control, or the page silently omits part of the list. */
    mount();
    const fold = await screen.findByTestId('unused-categories');
    expect(fold.textContent).toMatch(/1 unused/);
    expect(screen.queryByText('Other')).not.toBeInTheDocument();

    await userEvent.click(fold);
    expect(await screen.findByText('Other')).toBeInTheDocument();
  });

  it('*** NEVER FOLDS THE WHOLE LIST AWAY WHEN NOTHING WAS SPENT ***', async () => {
    /* A new instance, or one whose spend request failed, has no spenders at
       all — so every category is "unused" and the page would hide its own
       only controls behind a disclosure, on the very account that has nothing
       else to look at. Two existing tests went red on exactly this. */
    server.use(
      http.get('*/api/v1/analytics/categories/top', () =>
        HttpResponse.json({ success: true, categories: [] })),
    );
    mount();

    expect(await screen.findByText('Housing')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.queryByTestId('unused-categories')).not.toBeInTheDocument();
  });
});
