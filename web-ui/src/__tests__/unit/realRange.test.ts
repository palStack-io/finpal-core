import { describe, it, expect } from 'vitest';
import {
  bodyPath, climberPoint, contourLevels, elevationY, footPath, layoutRow, profileFloor, profileFor, rangeLabel,
  profileForPeak, realPeakKind, scaleTicks, summitPoint,
} from '../../utils/realRange';
import { PEAK_PROFILES, PROFILE_SOURCE } from '../../utils/peakProfiles';
/**
 * Real-elevation mountains (design move 3). The same cases in core, premium and mobile; change all three together.
 */
// The six catalogue peaks and their surveyed heights, exactly as `src/data/seed_mountains.py` seeds them.
const CATALOGUE: Array<[string, number]> = [
  ['table-mountain', 1085], ['ben-nevis', 1345], ['mount-fuji', 3776],
  ['mount-rainier', 4392], ['aconcagua', 6961], ['everest', 8849],
];
const frame = { x: 10, groundY: 400, pxPerM: 0.04, pxPerMx: 0.01 };

describe('peak profiles', () => {
  it('holds a real profile for every catalogue peak, summit pinned to the surveyed height', () => {
    expect(Object.keys(PEAK_PROFILES).sort()).toEqual(CATALOGUE.map(([s]) => s).sort());
    for (const [slug, metres] of CATALOGUE) {
      const p = PEAK_PROFILES[slug];
      expect(p.elevation_m).toBe(metres);
      expect(Math.max(...p.points.map((q) => q[1]))).toBe(metres);
      expect(p.points.length).toBeGreaterThanOrEqual(40);
      expect(p.points.length).toBeLessThanOrEqual(120);
      // The grid itself read close to the survey: a profile that disagreed by more than 3% is not this mountain.
      expect(Math.abs(p.dem_max_m - metres) / metres).toBeLessThan(0.03);
      // Distance runs forward along the transect.
      p.points.slice(1).forEach((q, i) => expect(q[0]).toBeGreaterThan(p.points[i][0]));
    }
  });

  it('records its source and licence next to the data', () => {
    expect(PROFILE_SOURCE.licence).toMatch(/^https:\/\//);
    expect(PROFILE_SOURCE.generated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('profile scaled to true height', () => {
  it('puts every summit at its real elevation on one shared scale', () => {
    for (const [slug, metres] of CATALOGUE) {
      const s = summitPoint(profileFor(slug)!, frame);
      expect(s.y).toBeCloseTo(frame.groundY - metres * frame.pxPerM, 1);
    }
    // Everest is drawn more than eight times as tall as Table Mountain, because it is.
    const ev = frame.groundY - summitPoint(profileFor('everest')!, frame).y;
    const tm = frame.groundY - summitPoint(profileFor('table-mountain')!, frame).y;
    expect(ev / tm).toBeCloseTo(8849 / 1085, 2);
  });

  it('closes the body on the profile floor and fades the rest to sea level', () => {
    const ev = profileFor('everest')!;
    const floorY = Math.round(elevationY(frame, profileFloor(ev)) * 10) / 10;
    expect(bodyPath(ev, frame)).toContain(`,${floorY} Z`);
    expect(footPath(ev, frame)).toContain(`,${frame.groundY}`);
    expect(profileFloor(ev)).toBeGreaterThan(4000);
  });

  it('draws contours every 1,000 m and a thinned scale', () => {
    expect(contourLevels(8849)).toEqual([1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]);
    expect(contourLevels(1085)).toEqual([1000]);
    expect(scaleTicks(8849)).toEqual([1000, 3000, 5000, 7000]);
    expect(scaleTicks(3776)).toEqual([1000, 2000, 3000]);
  });
});

describe('the climber', () => {
  const ev = profileFor('everest')!;
  it('stands at the real height given, on the skyline', () => {
    const c = climberPoint(ev, frame, 6200);
    expect(c.y).toBeCloseTo(frame.groundY - 6200 * frame.pxPerM, 1);
    const s = summitPoint(ev, frame);
    expect(c.x).toBeLessThan(s.x);    // on the way up, not past the summit
  });
  it('stands at the foot, at true height, below the transect floor', () => {
    const c = climberPoint(ev, frame, 0);
    expect(c.y).toBe(frame.groundY);
    expect(c.x).toBe(frame.x);
  });
  it('never goes above the summit', () => {
    expect(climberPoint(ev, frame, 99999)).toEqual(summitPoint(ev, frame));
  });
});

describe('colour by goal kind', () => {
  it('saving is green, debt is rust, Everest and unmeasured are grey', () => {
    expect(realPeakKind({ scale: 'build', unmeasured: false })).toBe('saving');
    expect(realPeakKind({ scale: 'cost', unmeasured: false })).toBe('debt');
    expect(realPeakKind({ scale: 'cost', unmeasured: true })).toBe('unmeasured');
    expect(realPeakKind({ scale: 'build' }, true)).toBe('everest');
    expect(realPeakKind(null)).toBe('unmeasured');
  });
  it('a band-5 saving goal is a green Everest, distinct from the shared grey one', () => {
    expect(realPeakKind({ scale: 'build', unmeasured: false })).toBe('saving');
    expect(profileFor('everest')!.elevation_m).toBe(8849);
  });
});

describe('labels and layout', () => {
  it('reads "<goal> · <peak> <elevation> m"', () => {
    expect(rangeLabel('Emergency fund', 'Mount Fuji', 3776, (n) => n.toLocaleString('en-GB')))
      .toBe('Emergency fund · Mount Fuji 3,776 m');
  });
  it('lays a row out on one horizontal scale that fits the width', () => {
    const ps = ['ben-nevis', 'everest', 'mount-fuji'].map((s) => profileFor(s)!);
    const { xs, pxPerMx } = layoutRow(ps, 1000, 20);
    const right = xs[2] + ps[2].length_m * pxPerMx;
    expect(right).toBeCloseTo(980, 0);
    expect(xs[0]).toBe(20);
    expect(xs[1]).toBeGreaterThan(xs[0]);
  });
  it('knows no profile for a slug outside the catalogue', () => {
    expect(profileFor('k2')).toBeNull();
    expect(profileFor(undefined)).toBeNull();
  });
});

describe('the goal-to-peak mapping is the server\'s', () => {
  it('reads the mountain slug, falls back to the band, and is null when unmeasured', () => {
    expect(profileForPeak({ unmeasured: false, band: 0, mountain: { slug: 'mount-fuji' } })!.elevation_m).toBe(3776);
    expect(profileForPeak({ unmeasured: false, band: 3, mountain: {} })!.elevation_m).toBe(4392);
    expect(profileForPeak({ unmeasured: true, band: 3, mountain: { slug: 'mount-rainier' } })).toBeNull();
    expect(profileForPeak(undefined)).toBeNull();
  });
});
