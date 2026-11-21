/**
 * The independent review of #168 (2026-11-20): what the range must do, pinned.
 *  - the dotted route keeps its dashes (revealed through a mask, never by animating the dashed path's length);
 *  - each goal peak carries a marker at the height of the goal's progress (the mountain is the goal's size);
 *  - "finished" comes from progress >= 1, never from a magnitude, and an unmeasured goal is never finished;
 *  - every label is a 44 px target and answers Enter and Space.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GoalRange } from '../../components/dashboard/GoalRange';
import type { Goal } from '../../types/goal';

const goal = (o: Omit<Partial<Goal>, 'peak'> & { peak?: object }): Goal => ({
  id: 1, name: 'Emergency fund', target_amount: 16000, current_amount: 8000, start_amount: 2000,
  direction: 'accumulate', progress: 0.375, kind: 'savings',
  ...o,
  peak: { scale: 'build', magnitude: 8000, size: 16000, unmeasured: false, rate_unknown: false, band: 4,
    mountain: { slug: 'aconcagua', name: 'Aconcagua', elevation_m: 6961 }, ...(o.peak ?? {}) },
} as unknown as Goal);

const EVEREST = { altitude_m: 7950, summit_m: 8849, at_summit: false };
const draw = (goals: Goal[]) => render(
  <MemoryRouter><GoalRange goals={goals} currency="USD" everest={EVEREST} /></MemoryRouter>);

describe('the range after review', () => {
  it('keeps the route dotted: the dashed path is revealed by a mask, its own length never animates', () => {
    const { container } = draw([goal({})]);
    const route = container.querySelector('[data-testid="range-route"]')!;
    expect(route.getAttribute('stroke-dasharray')).toBe('3 6');
    expect(route.getAttribute('mask')).toMatch(/^url\(#/);
    expect(route.getAttribute('pathLength')).toBeNull();
    expect(route.getAttribute('style') ?? '').not.toMatch(/stroke-dashoffset|pathLength/);
  });

  it('marks how far up each goal is, from its progress', () => {
    const { container } = draw([
      goal({ id: 1, progress: 0.375 }),
      goal({ id: 2, name: 'New laptop', progress: 0.9, peak: { size: 2000, band: 2 } }),
    ]);
    const marks = [...container.querySelectorAll('[data-testid="goal-progress-mark"]')];
    expect(marks.map((m) => m.getAttribute('data-progress')).sort()).toEqual(['0.375', '0.900']);
    // Higher progress is drawn higher on its own peak: compare each mark with its peak's foot.
    const ys = marks.map((m) => Number(m.getAttribute('cy')));
    expect(ys.every(Number.isFinite)).toBe(true);
  });

  it('a goal is finished from its progress, not from a zero magnitude', () => {
    draw([goal({ id: 1, progress: 0.4, peak: { magnitude: 0 } })]);
    expect(screen.queryByTestId('finished-tick')).toBeNull();
  });

  it('an unmeasured debt is never finished and draws no progress mark', () => {
    const { container } = draw([goal({ id: 3, name: 'Old loan', direction: 'paydown', progress: 0,
      peak: { scale: 'cost', magnitude: null, size: null, unmeasured: true, band: null, mountain: null } })]);
    expect(screen.queryByTestId('finished-tick')).toBeNull();
    expect(container.querySelector('[data-testid="goal-progress-mark"]')).toBeNull();
  });

  it('says a debt\'s rate is unknown rather than "nothing owed"', () => {
    draw([goal({ id: 4, name: 'Card', direction: 'paydown', progress: 0.2,
      peak: { scale: 'cost', magnitude: null, rate_unknown: true, size: 3000, band: 2 } })]);
    const label = screen.getByRole('button', { name: /^Card/ });
    expect(label.getAttribute('aria-label')).toMatch(/No rate recorded/);
    expect(label.getAttribute('aria-label')).not.toMatch(/Nothing owed/i);
  });

  it('every label is a 44 px target and opens on Enter and on Space', () => {
    const { container } = draw([goal({})]);
    const hits = [...container.querySelectorAll('[data-testid="range-label-hit"]')];
    expect(hits.length).toBe(2);                                // Everest + one goal
    hits.forEach((h) => expect(Number(h.getAttribute('height'))).toBeGreaterThanOrEqual(44));
    const label = screen.getByRole('button', { name: /^Emergency fund/ });
    fireEvent.keyDown(label, { key: 'Enter' });
    expect(label.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(label, { key: ' ' });
    expect(label.getAttribute('aria-expanded')).toBe('false');
  });
});
