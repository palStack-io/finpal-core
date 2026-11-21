/**
 * The South Col camps stand ON the real Everest (design move 3, 2026-11-20).
 *
 * The Everest glyph is generated from the real elevation profile (Dashboard C, peakShapes.ts), so the flank the camps are placed against is
 * read from the same profile. A camp outside the body would float in the sky on Basecamp and onboarding.
 */
import { describe, it, expect } from 'vitest';
import { EVEREST, FOOT_M, SUMMIT_X, placeEverest, routeLine, routeStops, SOUTH_COL_ROUTE } from '../../utils/everestRoute';

/** The body's outline as points, from its path (M/L commands only). */
const outline = (d: string): Array<[number, number]> =>
  [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

/** Even-odd point in polygon, with a small tolerance band on the edge. */
function inside(pt: { x: number; y: number }, poly: Array<[number, number]>): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

describe('the South Col route on the real Everest', () => {
  const place = { x: 0, y: 0, scale: 1 };            // box coordinates
  const poly = outline(EVEREST.body);

  it('reads its foot and summit from the profile, not from typed numbers', () => {
    expect(FOOT_M).toBeGreaterThan(4500);
    expect(FOOT_M).toBeLessThan(5364);                // Base Camp is above the drawn foot
    expect(SUMMIT_X).toBeGreaterThan(0);
    expect(SUMMIT_X).toBeLessThan(100);
  });

  it('puts every camp below the summit inside the mountain', () => {
    for (const stop of routeStops(place)) {
      if (stop.m >= 8849) continue;                    // the summit is ON the ridge line
      // A hair down, so a stop sitting exactly on the outline counts as on the rock.
      expect(inside({ x: stop.x, y: stop.y + 0.6 }, poly), `${stop.name} at ${stop.m} m`).toBe(true);
    }
  });

  it('climbs: each camp is higher on the drawing than the one before', () => {
    const ys = routeStops(place).map((s) => s.y);
    ys.slice(1).forEach((y, i) => expect(y).toBeLessThan(ys[i]));
    expect(routeStops(place)).toHaveLength(SOUTH_COL_ROUTE.length);
  });

  it('puts the summit stop on the summit', () => {
    const top = routeStops(placeEverest(500, 100, 400)).at(-1)!;
    expect(top.x).toBeCloseTo(500, 5);
    expect(top.y).toBeCloseTo(100, 5);
  });
});

describe('the route stays on the drawing and on the rock (Dashboard C)', () => {
  // Core has no Basecamp scene (premium only); the hero range's route is checked here and in heroRangeClimber.test.
  it('the hero range: Base Camp sits inside a 560 x 260 drawing', () => {
    const base = routeStops(placeEverest(252, 34, 230, 1.4))[0];
    expect(base.y).toBeLessThanOrEqual(260);
    expect(base.x).toBeGreaterThanOrEqual(0);
  });

  it('onboarding: the approach walks TOWARDS Base Camp, inside the 1200 x 420 viewBox', () => {
    const place = placeEverest(650, 80, 400);
    const base = routeStops(place)[0];
    const APPROACH_X = base.x - 90;               // OnboardingArt.tsx derives it the same way
    expect(APPROACH_X).toBeLessThan(base.x);
    expect(APPROACH_X).toBeGreaterThan(0);
    expect(base.y).toBeLessThanOrEqual(420);
  });

  it('every segment of the drawn route stays on the rock (its midpoint is inside the body)', () => {
    const poly = outline(EVEREST.body);
    const line = routeLine({ x: 0, y: 0, scale: 1 });
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]; const b = line[i];
      if (b.m >= 8849) continue;                   // the last step lands ON the summit, on the ridge line
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 0.6 };
      expect(inside(mid, poly), `${a.m} m to ${b.m} m`).toBe(true);
    }
  });
});
