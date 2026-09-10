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
import { render, screen, waitFor } from '@testing-library/react';
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
    const controls = await screen.findAllByLabelText('Spending group');
    await userEvent.selectOptions(controls[2], 'flexible');
    await waitFor(() => expect(puts.length).toBe(1));
    expect(puts[0].id).toBe('3');
  });
});
