/**
 * Dashboard C (2026-11-20): where the hero range puts Everest, the goal peaks and every label, for 0, 1 and 5 goals.
 * The layout is pure so these positions are the drawing's positions.
 */
import { describe, expect, it } from 'vitest';
import { layoutRange, layoutRangeFitting, LABEL_H, WIDEN, type RangeInput } from '../../components/dashboard/heroRangeLayout';
import { RANGE_SILHOUETTES, shapeSummit } from '../../utils/rangeSilhouettes';

const goal = (id: number, height: number, band = 3, label = `Goal number ${id}`): RangeInput => ({
  id: String(id), height, summit: shapeSummit(RANGE_SILHOUETTES[band].body), label, sub: 'saving',
});

const FIVE = [goal(1, 0.9, 4, 'Emergency fund · 100% up'), goal(2, 0.7, 3), goal(3, 0.5, 2), goal(4, 0.3, 1, 'Pay off the Visa Credit Card · 100% up'), goal(5, 0, 0)];

const overlap = (a: { cx: number; y: number; width: number }, b: { cx: number; y: number; width: number }) =>
  Math.abs(a.cx - b.cx) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < LABEL_H;

// The boxes the range really draws in: the hero's art slot (560 x 260), the stacked hero at 1024 and at 390 (x 240).
describe.each([[560, 260], [1080, 240], [342, 240]])('the hero range at %ix%i', (width, height) => {
  const opts = { width, height, hasEverest: true, everestLabel: 'Everest · you are at 8,584 m', everestAt: 0.42 };

  it('0 goals: Everest alone, at the back, label inside the drawing', () => {
    const l = layoutRange([], opts);
    expect(l.peaks).toHaveLength(0);
    expect(l.everest).not.toBeNull();
    expect(l.labels.map((x) => x.id)).toEqual(['everest']);
    const e = l.labels[0];
    expect(e.cx - e.width / 2).toBeGreaterThanOrEqual(0);
    expect(e.cx + e.width / 2).toBeLessThanOrEqual(width);
  });

  it('1 goal: stands in front of Everest, lower than its summit', () => {
    const l = layoutRange([goal(1, 0.6)], opts);
    expect(l.peaks).toHaveLength(1);
    expect(l.peaks[0].summitY).toBeGreaterThan(l.everest!.summitY);
    expect(l.peaks[0].summitX).toBeLessThan(l.everest!.summitX); // the tallest goal goes left first
  });

  it('5 goals: every label inside the drawing, none overlapping (widening only if it must)', () => {
    // What GoalRange draws: the box's width, or a wider drawing that scrolls when five long labels cannot fit.
    const l = layoutRangeFitting(FIVE, opts);
    expect(l.crowded).toBe(false);
    expect(l.peaks).toHaveLength(5);
    if (width >= 560) expect(l.width).toBe(width);
    for (const lab of l.labels) {
      expect(lab.cx - lab.width / 2, lab.id).toBeGreaterThanOrEqual(0);
      expect(lab.cx + lab.width / 2, lab.id).toBeLessThanOrEqual(l.width);
      expect(lab.y, lab.id).toBeGreaterThan(0);
    }
    for (let i = 0; i < l.labels.length; i++) {
      for (let j = i + 1; j < l.labels.length; j++) {
        expect(overlap(l.labels[i], l.labels[j]), `${l.labels[i].id} / ${l.labels[j].id}`).toBe(false);
      }
    }
  });

  it('5 goals: tallest nearest Everest, alternating sides', () => {
    const l = layoutRangeFitting(FIVE, opts);
    const at = (id: string) => l.peaks.find((p) => p.id === id)!.summitX;
    const ex = l.everest!.summitX;
    expect(at('1')).toBeLessThan(ex);
    expect(at('2')).toBeGreaterThan(ex);
    expect(Math.abs(at('1') - ex)).toBeLessThan(Math.abs(at('3') - ex));
    expect(Math.abs(at('2') - ex)).toBeLessThan(Math.abs(at('4') - ex));
  });
});

describe('the hero range keeps every shape undistorted except by one factor', () => {
  it('widens every peak, and Everest, by the same WIDEN', () => {
    const l = layoutRange(FIVE, { width: 1100, height: 300, hasEverest: true, everestLabel: 'Everest' });
    for (const p of l.peaks) expect(p.sx / p.scale).toBeCloseTo(WIDEN, 6);
    const e = l.everest!.place;
    expect((e.sx ?? e.scale) / e.scale).toBeCloseTo(WIDEN, 6);
  });

  it('a finished goal (height 0) is still drawn, as the smallest', () => {
    const l = layoutRange(FIVE, { width: 1100, height: 300, hasEverest: true, everestLabel: 'Everest' });
    const done = l.peaks.find((p) => p.id === '5')!;
    const heights = l.peaks.map((p) => l.groundY - p.summitY);
    expect(l.groundY - done.summitY).toBeGreaterThan(0);
    expect(l.groundY - done.summitY).toBe(Math.min(...heights));
  });

  it('without Everest the goals spread across the width', () => {
    const l = layoutRange(FIVE, { width: 1100, height: 300, hasEverest: false });
    expect(l.everest).toBeNull();
    const xs = l.peaks.map((p) => p.summitX);
    expect(Math.min(...xs)).toBeLessThan(300);
    expect(Math.max(...xs)).toBeGreaterThan(800);
  });
});
