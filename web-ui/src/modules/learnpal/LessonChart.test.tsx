import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LessonChart, MonthsToClear } from './LessonChart';
import type { ShortTry } from '../../types/learnpal';

const draw = (t: ShortTry) => render(<LessonChart t={t} currency="USD" />);
const width = (el: Element) => (el as HTMLElement).style.width;

describe('LessonChart', () => {
  it('month: one bar of what came in, the biggest category and the total out marked', () => {
    draw({ kind: 'month', income: '5200.00', spent: '2600.00', biggest_category: 'Housing', biggest_amount: '1300.00' });
    const chart = screen.getByRole('img', {
      name: '$5,200.00 came in. $2,600.00 went out, and Housing was the biggest at $1,300.00.',
    });
    expect(width(chart.querySelector('[data-part="biggest"]')!)).toBe('25%');
    expect(width(chart.querySelector('[data-part="rest-out"]')!)).toBe('25%');
    expect(screen.getByText('Housing $1,300.00')).toBeInTheDocument();
  });

  it('month: more out than in scales to what went out, never past the bar', () => {
    draw({ kind: 'month', income: '1000.00', spent: '2000.00', biggest_category: 'Rent', biggest_amount: '1000.00' });
    const chart = screen.getByTestId('lesson-chart');
    expect(width(chart.querySelector('[data-part="biggest"]')!)).toBe('50%');
    expect(width(chart.querySelector('[data-part="rest-out"]')!)).toBe('50%');
  });

  it('fixed share: ten cells, the last part-filled, never rounded to whole cells', () => {
    draw({ kind: 'fixed_share', income: '5200.00', fixed_amount: '2000.00', share_percent: '38' });
    const chart = screen.getByRole('img', { name: 'Fixed 38% of what came in. Still yours to choose 62%.' });
    const fills = [...chart.querySelectorAll('[data-part="cell-fill"]')].map(width);
    expect(fills).toEqual(['100%', '100%', '100%', '80%', '0%', '0%', '0%', '0%', '0%', '0%']);
    expect(screen.getByText('Fixed 38%')).toBeInTheDocument();
    expect(screen.getByText('Still yours to choose 62%')).toBeInTheDocument();
  });

  it('non-monthly: twelve monthly steps building to the yearly amount', () => {
    draw({ kind: 'sinking', item: 'Contents insurance', yearly: '132.00', monthly: '11.00' });
    const chart = screen.getByRole('img', { name: 'Twelve months of $11.00 add up to $132.00 for Contents insurance.' });
    const steps = [...chart.querySelectorAll('[data-part="step"]')].map((s) => (s as HTMLElement).style.height);
    expect(steps).toHaveLength(12);
    expect(steps[11]).toBe('100%');
    expect(steps[5]).toBe('50%');
  });

  it('buffer: the first cushion, both targets and what is held, scaled to the largest', () => {
    draw({ kind: 'buffer', essential_monthly: '1800.00', held: '12000.00', buffer_amount: '900.00',
           targets: [{ months: 3, target: '5400.00' }, { months: 6, target: '10800.00' }] });
    const chart = screen.getByRole('img', {
      name: 'You hold $12,000.00. A first cushion is $900.00; 3 months of essentials is $5,400.00; 6 months of essentials is $10,800.00.',
    });
    expect(width(chart.querySelector('[data-part="held"]')!)).toBe('100%');
    const ticks = [...chart.querySelectorAll('[data-part="tick"]')].map((t) => parseFloat((t as HTMLElement).style.left));
    expect(ticks.every((x) => x >= 0 && x <= 100)).toBe(true);
    expect(screen.getByText('6 months $10,800.00')).toBeInTheDocument();
  });

  it('interest: the payment split, interest charged first, the rest off the balance', () => {
    draw({ kind: 'interest', balance: '800.00', apr: '19.99', interest_month: '13.33', base_payment: '35.00',
           covers_interest: true, points: [] });
    const chart = screen.getByRole('img', { name: '$13.33 of a $35.00 payment goes to interest, $21.67 off the balance.' });
    expect(chart.querySelector('[data-part="interest"]')).not.toBeNull();
    expect(chart.querySelector('[data-part="principal"]')).not.toBeNull();
    expect(screen.getByText('Interest, charged first')).toBeInTheDocument();
  });

  it('interest: a payment that does not cover the interest draws no part off the balance', () => {
    draw({ kind: 'interest', balance: '5000.00', apr: '29.99', interest_month: '124.96', base_payment: '25.00',
           covers_interest: false, points: [] });
    const chart = screen.getByRole('img', { name: 'All of a $25.00 payment goes to interest; none comes off the balance yet.' });
    expect(width(chart.querySelector('[data-part="interest"]')!)).toBe('100%');
    expect(chart.querySelector('[data-part="principal"]')).toBeNull();
  });

  it('debt order: each balance, and where each way starts, as the server names them', () => {
    draw({ kind: 'debt_order', highest_rate: 'Visa', smallest: 'Visa', debts: [
      { name: 'Visa', balance: '800.00', apr: '19.99' }, { name: 'Student loan', balance: '14500.00', apr: '4.50' }] });
    const chart = screen.getByRole('img', {
      name: 'Visa, $800.00 at 19.99%. Student loan, $14,500.00 at 4.50%. Highest rate first and smallest balance first both start with Visa.',
    });
    expect(chart.querySelectorAll('[data-part="debt"]')).toHaveLength(2);
    expect(screen.getByText('Both ways start here')).toBeInTheDocument();
  });

  it('debt order: different starts are each marked', () => {
    draw({ kind: 'debt_order', highest_rate: 'Store', smallest: 'Tiny', debts: [
      { name: 'Store', balance: '800.00', apr: '29.00' }, { name: 'Tiny', balance: '200.00', apr: '5.00' }] });
    expect(screen.getByText('Highest rate first starts here')).toBeInTheDocument();
    expect(screen.getByText('Smallest balance first starts here')).toBeInTheDocument();
  });

  it('a missing figure draws no chart at all', () => {
    const cases = [
      { kind: 'month', income: '', spent: '10.00', biggest_category: 'Food', biggest_amount: '5.00' },
      { kind: 'fixed_share', income: '100.00', fixed_amount: '30.00', share_percent: undefined },
      { kind: 'sinking', item: 'Car tax', yearly: 'abc', monthly: '1.00' },
      { kind: 'buffer', essential_monthly: '100.00', held: undefined, buffer_amount: '50.00', targets: [] },
      { kind: 'interest', balance: '1.00', apr: '1.00', interest_month: null, base_payment: '25.00', covers_interest: true, points: [] },
      { kind: 'debt_order', debts: [] },
    ] as unknown as ShortTry[];
    for (const t of cases) {
      const { unmount } = draw(t);
      expect(screen.queryByTestId('lesson-chart')).toBeNull();
      unmount();
    }
  });

  it('nothing in a chart animates', () => {
    draw({ kind: 'month', income: '5200.00', spent: '2600.00', biggest_category: 'Housing', biggest_amount: '1300.00' });
    const all = [screen.getByTestId('lesson-chart'), ...screen.getByTestId('lesson-chart').querySelectorAll('*')];
    expect(all.some((el) => (el as HTMLElement).style.transition || (el as HTMLElement).style.animation)).toBe(false);
  });
});

describe('MonthsToClear', () => {
  const t = (points: { extra: number; months: number | null; interest_total: string | null }[]) => ({
    kind: 'interest' as const, balance: '800.00', apr: '19.99', interest_month: '13.33', base_payment: '35.00',
    covers_interest: true, points,
  });
  const POINTS = [0, 10, 20, 30, 40, 50].map((extra, i) => ({
    extra, months: [30, 22, 17, 14, 12, 10][i], interest_total: ['215.34', '156.63', '123.81', '102.79', '88.21', '75.00'][i],
  }));

  it('draws months to clear at the base payment and +10, +20, +40', () => {
    render(<MonthsToClear t={t(POINTS)} currency="USD" />);
    const chart = screen.getByRole('img', {
      name: 'Months to clear: $35.00 a month, 30 months; $10.00 more, 22 months; $20.00 more, 17 months; $40.00 more, 12 months.',
    });
    const bars = [...chart.querySelectorAll('[data-part="months"]')].map(width);
    expect(bars).toEqual(['100%', `${(22 / 30) * 100}%`, `${(17 / 30) * 100}%`, '40%']);
    expect(screen.getByText('Interest over the whole time: $215.34 at $35.00, $88.21 with $40.00 more.')).toBeInTheDocument();
  });

  it('leaves out a payment that never clears, and draws nothing with fewer than two that do', () => {
    const someNever = POINTS.map((p) => (p.extra === 0 ? { ...p, months: null, interest_total: null } : p));
    const { unmount } = render(<MonthsToClear t={t(someNever)} currency="USD" />);
    expect(screen.getByTestId('months-to-clear').querySelectorAll('[data-part="months"]')).toHaveLength(3);
    unmount();
    render(<MonthsToClear t={t(POINTS.map((p) => (p.extra === 40 ? p : { ...p, months: null, interest_total: null })))} currency="USD" />);
    expect(screen.queryByTestId('months-to-clear')).toBeNull();
  });
});
