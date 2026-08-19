/**
 * Suggested categories survive the first category — palStack-io/finpal-core#125.
 *
 * The panel was gated on `parentCategories.length === 0`, so creating one category removed
 * all 24 suggestions at once. The reporter's words: *"Every categories suggestion disappear
 * when creating your first, imho they should remain. Or can be disabled with a flag."*
 *
 * They tagged it `[NOT ISSUE]`, and as a crash it is not one — but "the feature that helps
 * you set up stops helping after one step" is worth fixing, and the reporter named both
 * halves of the fix themselves.
 *
 * What is asserted here is the behaviour, not the gate:
 *
 *   1. suggestions still show once a category exists
 *   2. a suggestion the user has already created is no longer offered — the one thing the
 *      old gate got right, and the reason this is not simply `true`
 *   3. matching is case-insensitive, because the user types the name
 *   4. "Hide these" is the flag, and it persists
 *   5. the panel disappears when there is genuinely nothing left to suggest
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { CategoryManagement } from '../../components/CategoryManagement';

const getAll = vi.fn();

vi.mock('../../services/api/categories', () => ({
  categoriesApi: {
    getAll: (...args: unknown[]) => getAll(...args),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const category = (id: number, name: string) => ({
  id,
  name,
  icon: '🏷️',
  color: '#15803d',
  parent_id: null,
  is_system: false,
});

/** Every name the suggestion panel can offer, read off the component's own list. */
const ALL_SUGGESTIONS = [
  'Food & Dining', 'Transportation', 'Entertainment', 'Shopping', 'Utilities',
  'Healthcare', 'Housing', 'Income', 'Savings', 'Travel', 'Education', 'Fitness',
  'Groceries', 'Coffee & Tea', 'Restaurants', 'Gas', 'Parking', 'Public Transit',
  'Movies', 'Concerts', 'Gaming', 'Clothing', 'Electronics', 'Home Decor',
];

const renderWith = (categories: ReturnType<typeof category>[]) => {
  // The ENVELOPE, not a bare array. `loadCategories` reads `data.categories`, and an
  // earlier version of this file resolved the array directly — so `data.categories` was
  // undefined, the component held zero categories, and three tests failed while the
  // component was correct. Checked against the component rather than assumed: an interface
  // is a claim about a payload, not a check of one.
  getAll.mockResolvedValue({ categories });
  return render(
    <MemoryRouter>
      <CategoryManagement />
    </MemoryRouter>,
  );
};

const panel = () => screen.queryByText('Suggested Categories');

beforeEach(() => {
  localStorage.clear();
  getAll.mockReset();
});

describe('the suggestion panel outlives the first category', () => {
  it('shows suggestions when the user has none — the case that already worked', async () => {
    renderWith([]);
    await waitFor(() => expect(panel()).toBeTruthy());
  });

  it('STILL shows suggestions after one category exists', async () => {
    renderWith([category(1, 'Groceries')]);
    await waitFor(() => expect(panel()).toBeTruthy());
  });

  it('stops offering a category the user has already created', async () => {
    renderWith([category(1, 'Groceries')]);
    await waitFor(() => expect(panel()).toBeTruthy());

    // The panel is there, and "Groceries" appears only as the created row — never again as
    // a suggestion. Scoped to the suggestion grid so the row itself is not miscounted.
    const suggestionGrid = panel()!.closest('div')!.parentElement!;
    const offered = ALL_SUGGESTIONS.filter(
      (name) => suggestionGrid.textContent?.includes(name),
    );
    expect(offered).not.toContain('Groceries');
    expect(offered.length).toBeGreaterThan(0);
  });

  it('matches names case-insensitively', async () => {
    // The user typed it themselves, so the case is theirs, not the suggestion list's.
    renderWith([category(1, 'groceries')]);
    await waitFor(() => expect(panel()).toBeTruthy());

    const suggestionGrid = panel()!.closest('div')!.parentElement!;
    const offered = ALL_SUGGESTIONS.filter(
      (name) => suggestionGrid.textContent?.includes(name),
    );
    expect(offered).not.toContain('Groceries');
  });

  it('hides the panel entirely once every suggestion has been created', async () => {
    renderWith(ALL_SUGGESTIONS.map((name, i) => category(i + 1, name)));
    await waitFor(() => expect(getAll).toHaveBeenCalled());
    expect(panel()).toBeNull();
  });
});

describe('"Hide these" is the flag the reporter asked for', () => {
  it('removes the panel and remembers the choice', async () => {
    const user = userEvent.setup();
    renderWith([category(1, 'Groceries')]);
    await waitFor(() => expect(panel()).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /hide these/i }));
    expect(panel()).toBeNull();

    // Persisted, so it does not come back on the next visit.
    expect(localStorage.getItem('finpal.categorySuggestions.dismissed')).toBe('true');
  });

  it('stays hidden on a fresh mount when the choice was already made', async () => {
    localStorage.setItem('finpal.categorySuggestions.dismissed', 'true');
    renderWith([category(1, 'Groceries')]);
    await waitFor(() => expect(getAll).toHaveBeenCalled());
    expect(panel()).toBeNull();
  });
});
