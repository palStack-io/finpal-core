/**
 * Dashboard C (2026-11-20): the climber stands on Everest at the person's real altitude, which comes from acts
 * (`everest.altitude_m`, the wallet), never from money. Placed on the South Col route by elevation.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GoalRange } from '../../components/dashboard/GoalRange';
import { layoutRange } from '../../components/dashboard/heroRangeLayout';
import { climbPoint, routeStops } from '../../utils/everestRoute';
import type { Goal } from '../../types/goal';

const goal = (o: Partial<Goal>): Goal => ({
  id: 1, name: 'Emergency fund', target_amount: 16000, current_amount: 8000, start_amount: 2000,
  direction: 'accumulate', progress: 0.375, kind: 'savings',
  peak: { scale: 'build', magnitude: 8000, unmeasured: false, band: 3,
    mountain: { slug: 'mount-rainier', name: 'Mount Rainier', elevation_m: 4392 } },
  ...o,
} as unknown as Goal);

const climber = (c: HTMLElement) => {
  const el = c.querySelector('[data-testid="range-climber"]')!;
  return { x: Number(el.getAttribute('cx')), y: Number(el.getAttribute('cy')) };
};

const draw = (altitude: number, goals: Goal[] = [goal({})]) => render(
  <MemoryRouter>
    <GoalRange goals={goals} currency="USD" everest={{ altitude_m: altitude, summit_m: 8849, at_summit: false }} />
  </MemoryRouter>,
);

describe('the climber on Everest', () => {
  it('stands at the South Col at 7,950 m, exactly where the route puts that camp', () => {
    const { container } = draw(7950);
    // jsdom lays nothing out, so the range draws at its fallback box: 560 wide, 260 tall (the hero's art slot), Everest at 0.45.
    const l = layoutRange([], { width: 560, height: 260, hasEverest: true, everestLabel: '', everestAt: 0.45 });
    const col = routeStops(l.everest!.place).find((s) => s.name === 'South Col')!;
    const at = climber(container);
    expect(at.x).toBeCloseTo(col.x, 0);
    expect(at.y).toBeCloseTo(col.y, 0);
  });

  it('is higher at 8,584 m than at Base Camp', () => {
    const high = climber(draw(8584).container);
    const base = climber(draw(5364).container);
    expect(high.y).toBeLessThan(base.y);
  });

  it('does not move with money: the same altitude with very different goals stands in the same place', () => {
    const a = climber(draw(6400, [goal({ current_amount: 100 })]).container);
    const b = climber(draw(6400, [goal({ current_amount: 15900, progress: 0.99 })]).container);
    const c = climber(draw(6400, []).container);
    expect(a).toEqual(b);
    expect(a).toEqual(c);
  });

  it('follows climbPoint for any altitude', () => {
    const l = layoutRange([], { width: 560, height: 260, hasEverest: true, everestLabel: '', everestAt: 0.45 });
    for (const m of [0, 3000, 5364, 6065, 7162, 8849]) {
      const want = climbPoint(l.everest!.place, m, l.everest!.approachX);
      const got = climber(draw(m, []).container);
      expect(got.x, `${m} m`).toBeCloseTo(want.x, 0);
      expect(got.y, `${m} m`).toBeCloseTo(want.y, 0);
    }
  });

  it('names the range for a screen reader, Everest included', () => {
    const { container } = draw(8584);
    const group = container.querySelector('svg[role="group"]')!;
    expect(group.getAttribute('aria-label')).toMatch(/Everest/);
    expect(group.getAttribute('aria-label')).toMatch(/Emergency fund/);
  });
});
