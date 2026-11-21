/**
 * Everest as finPal draws it: the silhouette (`mountainSilhouettes.ts`, index 5) and the real South Col route, every
 * camp at its true elevation (owner rule 2026-10-12: mountains follow real topography).
 *
 * The silhouette lives in a 100-wide box whose summit is at y = 11 and whose foot is at y = 100. Since Dashboard C
 * (2026-11-20) it is generated from Everest's real elevation profile (`peakShapes.ts`), so the foot is the cropped
 * transect's lowest ground (`FOOT_M`) and the flank and summit are read from the same outline, never typed in: a
 * hand-typed flank against a generated body is how the camps would float off the mountain. Each camp sits just
 * inside the left flank the route climbs. Placement is a uniform scale: never stretch.
 */
import { MOUNTAIN_SILHOUETTES, UNMEASURED_RIDGE } from './mountainSilhouettes';
import { EVEREST_FOOT_M, EVEREST_OUTLINE } from './peakShapes';

export const EVEREST = MOUNTAIN_SILHOUETTES[5];
export const RIDGE = UNMEASURED_RIDGE;
export const SUMMIT_M = 8849;
export const BASE_CAMP_M = 5364;
/** The lowest ground of the drawn transect: the foot of the body. */
export const FOOT_M = EVEREST_FOOT_M;
const FOOT_Y = 100;
const TOP = EVEREST_OUTLINE.reduce((best, p, i) => (p[1] < EVEREST_OUTLINE[best][1] ? i : best), 0);
const SUMMIT_Y = EVEREST_OUTLINE[TOP][1];
/** The summit's x in the 100-wide box. */
export const SUMMIT_X = EVEREST_OUTLINE[TOP][0];

/** The named stops on the South Col route, base camp to summit, with their real elevations. */
export const SOUTH_COL_ROUTE: ReadonlyArray<{ name: string; m: number }> = [
  { name: 'Base Camp', m: 5364 },
  { name: 'Khumbu Icefall', m: 5800 },
  { name: 'Camp I', m: 6065 },
  { name: 'Camp II', m: 6400 },
  { name: 'Camp III', m: 7162 },
  { name: 'South Col', m: 7950 },
  { name: 'The Balcony', m: 8400 },
  { name: 'South Summit', m: 8749 },
  { name: 'Summit', m: 8849 },
];

/** The left flank of the silhouette (foot to summit), from the generated outline. */
const LEFT_FLANK: ReadonlyArray<readonly [number, number]> = EVEREST_OUTLINE.slice(0, TOP + 1);

/** Height on the 100-box for an elevation. */
export const boxY = (m: number): number =>
  FOOT_Y - ((Math.min(SUMMIT_M, Math.max(FOOT_M, m)) - FOOT_M) / (SUMMIT_M - FOOT_M)) * (FOOT_Y - SUMMIT_Y);

/**
 * The flank's x at a box height, a few units inside the slope (the summit itself sits on the ridge line).
 *
 * *** THE LAST CROSSING BEFORE THE SUMMIT, NOT THE FIRST. *** The real flank has a shoulder with a dip behind it;
 * the first place the ground reaches a height may be on that shoulder, and a camp put there and inset towards the
 * summit lands in the dip, in the sky. From the last crossing the ground stays above that height all the way up.
 */
export function flankX(y: number): number {
  for (let i = LEFT_FLANK.length - 1; i >= 1; i--) {
    const [x0, y0] = LEFT_FLANK[i - 1]; const [x1, y1] = LEFT_FLANK[i];
    if (y <= y0 && y >= y1) {
      const t = y0 === y1 ? 0 : (y0 - y) / (y0 - y1);
      const x = x0 + (x1 - x0) * t;
      const inset = Math.min(5, SUMMIT_X - x) * Math.min(1, (y - SUMMIT_Y) / 20);
      return x + inset;
    }
  }
  return LEFT_FLANK[0][0];
}

/** Where a placed Everest sits in a scene: its box origin and uniform scale. */
export interface Placement {
  x: number; y: number; scale: number;
  /** Horizontal scale when a drawing widens every peak in it by one factor (the Dashboard range); else `scale`. */
  sx?: number;
}

/** Place Everest so its summit is at (summitX, summitY) and its foot on `baseY`. */
export function placeEverest(summitX: number, summitY: number, baseY: number, widen = 1): Placement {
  const scale = (baseY - summitY) / (FOOT_Y - SUMMIT_Y);
  const sx = scale * widen;
  return widen === 1
    ? { x: summitX - SUMMIT_X * scale, y: summitY - SUMMIT_Y * scale, scale }
    : { x: summitX - SUMMIT_X * sx, y: summitY - SUMMIT_Y * scale, scale, sx };
}

/** A box point to scene coordinates. */
export const toScene = (p: Placement, bx: number, by: number) => ({ x: p.x + bx * (p.sx ?? p.scale), y: p.y + by * p.scale });

/** The route's stops in scene coordinates. */
export function routeStops(p: Placement) {
  return SOUTH_COL_ROUTE.map((s) => {
    const by = boxY(s.m);
    return { ...s, ...toScene(p, s.m >= SUMMIT_M ? SUMMIT_X : flankX(by), by) };
  });
}

/** Metres between the extra points the route takes between camps, so it follows the flank instead of cutting
 *  straight across a dip behind a shoulder. */
const ROUTE_STEP_M = 50;

/**
 * The route as a dense line Base Camp to summit: every camp, and a point every 50 m between them, each placed on
 * the flank at its elevation. `m` is the elevation of each point. Drawing and climbing both read this, so the dot is
 * always on the drawn trail, and the trail stays on the rock (review of #168).
 */
export function routeLine(p: Placement): Array<{ x: number; y: number; m: number }> {
  const stops = routeStops(p);
  const out: Array<{ x: number; y: number; m: number }> = [{ x: stops[0].x, y: stops[0].y, m: stops[0].m }];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1].m; const b = stops[i].m;
    for (let m = a + ROUTE_STEP_M; m < b; m += ROUTE_STEP_M) {
      const by = boxY(m);
      out.push({ ...toScene(p, flankX(by), by), m });
    }
    out.push({ x: stops[i].x, y: stops[i].y, m: b });
  }
  return out;
}

/**
 * The household's point on the climb for an altitude in metres. Below Base Camp it walks the approach trail
 * along the valley floor (from `approachStartX` to Base Camp); from Base Camp up it follows the route BY
 * ELEVATION, between the real camps, so a marker at 7,950 m is at the South Col and nowhere else.
 */
/** How far below Base Camp (in scene units, per unit of scale) the approach trail starts: the trek from the
 *  valley climbs into Base Camp, so the trail rises too. */
const APPROACH_DROP = 5;

export function climbPoint(p: Placement, altitudeM: number, approachStartX: number) {
  const stops = routeStops(p);
  const base = stops[0];
  if (altitudeM <= BASE_CAMP_M) {
    const t = Math.max(0, altitudeM) / BASE_CAMP_M;
    const startY = base.y + APPROACH_DROP * p.scale;
    return { x: approachStartX + (base.x - approachStartX) * t, y: startY + (base.y - startY) * t };
  }
  const line = routeLine(p);
  for (let i = 1; i < line.length; i++) {
    if (altitudeM <= line[i].m) {
      const a = line[i - 1], b = line[i];
      const t = (altitudeM - a.m) / (b.m - a.m);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return { x: line[line.length - 1].x, y: line[line.length - 1].y };
}

/** An SVG path along the route (with the approach in front), for drawing it. */
export function routePath(p: Placement, approachStartX: number): string {
  const line = routeLine(p);
  return [`M${approachStartX} ${(line[0].y + APPROACH_DROP * p.scale).toFixed(1)}`, ...line.map((s) => `L${s.x.toFixed(1)} ${s.y.toFixed(1)}`)].join(' ');
}
