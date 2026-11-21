/** Budgets C and Dashboard C (core), the small pure rules: row status, row icons, the compact lesson bar, greeting. */
import { describe, expect, it } from 'vitest';
import { Car, HeartPulse, ShoppingCart, Tag } from 'lucide-react';
import { rowStatus, statusText } from '../../components/budgets/budgetFigures';
import { budgetLineIcon } from '../../components/budgets/budgetLineIcon';
import { compactModel } from '../../modules/learnpal/CompactLessonChart';
import { greeting } from '../../components/dashboard/greeting';

const pace = { fraction: 0.5, day: 15, days_in_month: 30, as_of: '2026-11-15' };
const money = (n: number) => `$${n.toFixed(2)}`;

describe('rowStatus: classifies the server figures, computes none', () => {
  it('over is the server remaining < 0 (rollover included), whatever the percentage says', () => {
    expect(rowStatus({ remaining: -40, percentage: 90, pace_applies: true }, pace)).toEqual({ kind: 'over', amount: 40 });
    // Spent past the bare plan but a carry-over left room: not over.
    expect(rowStatus({ remaining: 20, percentage: 110, pace_applies: true }, pace).kind).toBe('ahead');
  });
  it('pace words only where the server says the mark can be read', () => {
    expect(rowStatus({ remaining: 10, percentage: 80, pace_applies: false }, pace).kind).toBe('within');
    expect(rowStatus({ remaining: 10, percentage: 80, pace_applies: true }, null).kind).toBe('within');
    expect(rowStatus({ remaining: 10, percentage: 52, pace_applies: true }, pace).kind).toBe('onPace');
    expect(rowStatus({ remaining: 10, percentage: 20, pace_applies: true }, pace).kind).toBe('plenty');
  });
  it('says each one in words', () => {
    expect(statusText({ kind: 'over', amount: 12.5 }, money)).toBe('Over by $12.50');
    expect(statusText({ kind: 'plenty' }, money)).toBe('Plenty left');
  });
});

describe('budgetLineIcon: whole words, never a substring', () => {
  it('matches the obvious ones', () => {
    expect(budgetLineIcon('Groceries')).toBe(ShoppingCart);
    expect(budgetLineIcon('Car insurance')).toBe(Car);
  });
  it('"Healthcare" is never a car, and an unknown name is a plain tag', () => {
    expect(budgetLineIcon('Healthcare')).toBe(HeartPulse);
    expect(budgetLineIcon('Carpets')).toBe(Tag);
    expect(budgetLineIcon(null)).toBe(Tag);
  });
});

describe('compactModel: the lesson\'s own figures, or nothing', () => {
  it('fixed share and sinking have a compact form', () => {
    expect(compactModel({ kind: 'fixed_share', income: '4750.00', fixed_amount: '1500.00', share_percent: '31.6' }))
      .toEqual({ kind: 'fixed_share', percent: 32 });
    expect(compactModel({ kind: 'sinking', item: 'Car insurance', yearly: '1200.00', monthly: '100.00' }))
      .toEqual({ kind: 'sinking', monthly: 100, yearly: 1200 });
  });
  it('a missing or odd figure, or another kind, draws nothing', () => {
    expect(compactModel({ kind: 'fixed_share', income: '1', fixed_amount: '1', share_percent: '' })).toBeNull();
    expect(compactModel({ kind: 'sinking', item: 'x', yearly: '0', monthly: '10' })).toBeNull();
    expect(compactModel(null)).toBeNull();
  });
});

describe('greeting', () => {
  it('by the time of day, with the first name when there is one', () => {
    expect(greeting(new Date(2026, 10, 20, 9), 'Alex')).toBe('Good morning, Alex');
    expect(greeting(new Date(2026, 10, 20, 14), null)).toBe('Good afternoon');
    expect(greeting(new Date(2026, 10, 20, 19), '  ')).toBe('Good evening');
  });
});
