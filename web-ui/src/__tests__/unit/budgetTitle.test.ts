/**
 * D-192: every budget rendered an empty heading.
 *
 * *** THE PAGE HAS TWO RENDERING PATHS AND THE KEY EXISTED ON ONLY ONE. *** The
 * flat list goes through `enrichedBudgets`, which BUILDS `category_name`; the
 * grouped view is handed `overview.groups` straight from the API, where the name
 * is NESTED at `category.name`. Four anonymous budgets on the live demo, and
 * nothing said which was which.
 *
 * The shapes below are the REAL ones, read off `GET /budgets/overview` on the
 * demo — including `name: null`, which is what it actually sends for a budget
 * nobody has labelled.
 */
import { describe, it, expect } from 'vitest';
import { budgetTitle } from '../../pages/BudgetsMinimal';

describe('budgetTitle', () => {
  it('reads the NESTED category name the grouped payload actually sends', () => {
    expect(budgetTitle({ name: null, category: { name: 'Food & Dining' } }))
      .toBe('Food & Dining');
  });

  it('reads the FLAT category_name the enricher builds', () => {
    expect(budgetTitle({ category_name: 'Entertainment' })).toBe('Entertainment');
  });

  it("prefers the budget's OWN name, because a user who named it meant it", () => {
    expect(budgetTitle({
      name: 'Holiday spending', category_name: 'Travel',
      category: { name: 'Travel' },
    })).toBe('Holiday spending');
  });

  it('NEVER returns an empty string, which is the defect itself', () => {
    // *** THE ASSERTION THAT WOULD HAVE CAUGHT D-192. *** An empty heading
    // breaks no layout and fails no gate — it leaves a gap where a name should
    // be, and the page still renders, still answers 200, and still has valid
    // heading structure.
    for (const shape of [
      {},
      { name: null, category: null },
      { name: '', category_name: '', category: { name: '' } },
      { name: '   ', category_name: '  ' },
      { category: {} },
    ]) {
      expect(budgetTitle(shape)).not.toBe('');
      expect(budgetTitle(shape)).toBe('Uncategorized');
    }
  });

  it('does not fall back past a name that exists further down the chain', () => {
    expect(budgetTitle({ name: '  ', category: { name: 'Shopping' } }))
      .toBe('Shopping');
  });
});
