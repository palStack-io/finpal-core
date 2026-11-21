#!/usr/bin/env node
/**
 * Turn the six real elevation profiles into the FILLED mountain shapes every finPal surface draws (Dashboard C,
 * 2026-11-20): a realistic ridgeline (shoulders, false summits, jagged tops), a lit face and a shadow face, and snow
 * above a snowline. Run once; the output is committed.
 *
 *   node tools/peaks/generate-silhouettes.mjs web-ui/src/utils/peakShapes.ts
 *
 * Input: `profiles.json` beside this script, the profiles `generate-profiles.mjs` read from Mapzen Terrain Tiles on
 * 2026-11-20 (one skyline transect through each surveyed summit; attribution in ATTRIBUTION.txt). That script
 * writes a TypeScript module; its `PEAK_PROFILES` object is what `profiles.json` holds, unchanged.
 *
 * *** WHY THIS AND NOT THE REAL-ELEVATION RANGE (#163, reverted by #166). *** #163 drew every peak to one metre
 * scale with contour lines; Harun brought the earlier filled style back. This keeps that style (solid peaks, snow
 * caps, a lit and a shaded face) and takes only the OUTLINE from the real data: each transect is normalised into the
 * same boxes the hand-drawn shapes used (`0 0 100 100` for the range, `0 0 100 boxHeight` for a goal card), which is a
 * vertical exaggeration of one factor per shape, never a stretched path at render time.
 *
 * Steps per peak:
 *  1. Crop the transect to the mountain: from the summit out to where the ground first falls to `CROP` of the
 *     relief on each side (or the transect's end), so a broad peak like Fuji is not a hump in a wide box.
 *  2. Normalise: x across the box, the summit at `summitY`, the crop's lowest ground (or `floorM`) at the box floor.
 *  3. Taper the outer `TAPER` of each side to the floor with a smoothstep, so the foot meets the ground instead of
 *     ending in a cliff where the transect stopped.
 *  4. Simplify (Ramer-Douglas-Peucker, `EPS` box units): keeps the jags, drops the noise.
 *  5. Shade: the face right of a spine that drops from the summit to the floor with a few kinks.
 *  6. Snow: the ridge above `snowline` (a share of the box height, per peak) closed by a jagged lower edge whose
 *     teeth hang into the gullies. Table Mountain has none: its flat top is its identity.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { profiles } = JSON.parse(fs.readFileSync(path.join(here, 'profiles.json'), 'utf8'));

const ORDER = ['table-mountain', 'ben-nevis', 'mount-fuji', 'mount-rainier', 'aconcagua', 'everest'];
const NAMES = ['Table Mountain, 1,085 m', 'Ben Nevis, 1,345 m', 'Mount Fuji, 3,776 m', 'Mount Rainier, 4,392 m',
  'Aconcagua, 6,961 m', 'Everest, 8,849 m'];

/**
 * Per peak: where to crop (share of relief; `cropLeft` when the left side differs: Everest keeps its whole left
 * side so the South Col route starts at Base Camp, 5,364 m, above the drawn foot), how deep the snow reaches (share of box height below the summit), and
 * the summit's y on the range box (Table Mountain is a low flat top, Everest the full height, as the hand-drawn range
 * shapes had it).
 */
const STYLE = {
  'table-mountain': { crop: 0.75, snow: 0, rangeTop: 34 },
  'ben-nevis': { crop: 0.55, snow: 0.14, rangeTop: 10 },
  'mount-fuji': { crop: 0.12, snow: 0.30, rangeTop: 6 },
  'mount-rainier': { crop: 0.2, snow: 0.40, rangeTop: 3 },
  'aconcagua': { crop: 0.15, snow: 0.30, rangeTop: 2 },
  'everest': { crop: 0.25, cropLeft: 0.03, floorM: 5000, snow: 0.36, rangeTop: 0 },
};
const TAPER = 0.12;
/** How far each snow tooth hangs below (+) or stops above (-) the snowline: irregular, as gullies are. */
const HANG = [0.6, -0.2, 0.95, 0.05, 0.45, -0.3, 0.8];
const EPS = 0.55;

/** The goal-card ladder: box height and summit y per band, the same as the hand-drawn table had. */
const CARD = [
  { boxHeight: 30, summitY: 7 },
  { boxHeight: 42, summitY: 10 },
  { boxHeight: 56, summitY: 10 },
  { boxHeight: 68, summitY: 16 },
  { boxHeight: 84, summitY: 14 },
  { boxHeight: 100, summitY: 11 },
];

const r1 = (n) => Math.round(n * 10) / 10;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function crop(points, frac, fracLeft = frac) {
  let top = 0;
  points.forEach((p, i) => { if (p[1] > points[top][1]) top = i; });
  const floorAll = Math.min(...points.map((p) => p[1]));
  const cut = floorAll + frac * (points[top][1] - floorAll);
  const cutLeft = floorAll + fracLeft * (points[top][1] - floorAll);
  let a = top; while (a > 0 && points[a - 1][1] > cutLeft) a--;
  let b = top; while (b < points.length - 1 && points[b + 1][1] > cut) b++;
  a = Math.max(0, a - 1); b = Math.min(points.length - 1, b + 1);
  return points.slice(a, b + 1);
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [x0, y0] = pts[0]; const [x1, y1] = pts[pts.length - 1];
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  let worst = 0; let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((y1 - y0) * pts[i][0] - (x1 - x0) * pts[i][1] + x1 * y0 - y1 * x0) / len;
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, at + 1), eps).slice(0, -1), ...rdp(pts.slice(at), eps)];
}

/** The ridge in a `w x h` box, summit at `summitY`, foot on y = h; summit kept as a vertex. */
function ridge(slug, w, h, summitY) {
  const p = profiles[slug];
  const pts = crop(p.points, STYLE[slug].crop, STYLE[slug].cropLeft);
  const d0 = pts[0][0]; const d1 = pts[pts.length - 1][0];
  // `floorM` puts the box floor at a fixed elevation below the transect's own lowest ground (Everest: 5,000 m,
  // where the hand-drawn shape had it), so Base Camp (5,364 m) stands on the slope, not at the very foot.
  const floor = Math.min(STYLE[slug].floorM ?? Infinity, ...pts.map((q) => q[1]));
  const relief = p.elevation_m - floor;
  const out = pts.map(([d, e]) => {
    const u = (d - d0) / (d1 - d0);
    const taper = smooth(Math.min(u, 1 - u) / TAPER);
    const hgt = ((e - floor) / relief) * taper;
    return [u * w, h - hgt * (h - summitY)];
  });
  let top = 0;
  out.forEach((q, i) => { if (q[1] < out[top][1]) top = i; });
  const simplified = [...rdp(out.slice(0, top + 1), EPS).slice(0, -1), ...rdp(out.slice(top), EPS)];
  simplified[0] = [0, h];
  simplified[simplified.length - 1] = [w, h];
  return simplified.map(([x, y]) => [r1(x), r1(y)]);
}

const pathOf = (pts) => `M${pts.map(([x, y]) => `${x},${y}`).join(' L')} Z`;

/** The ridge's y at x (linear between vertices). */
function ridgeY(pts, x) {
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [xa, ya] = pts[i - 1]; const [xb, yb] = pts[i];
      const t = xb === xa ? 0 : (x - xa) / (xb - xa);
      return ya + (yb - ya) * t;
    }
  }
  return pts[pts.length - 1][1];
}

/** The shadow face: right of a spine from the summit to the floor. */
function shade(pts, w, h) {
  let top = 0;
  pts.forEach((q, i) => { if (q[1] < pts[top][1]) top = i; });
  const [sx, sy] = pts[top];
  const foot = sx + (w - sx) * 0.12;
  const spine = [0.22, 0.45, 0.7].map((t, i) => {
    const y = sy + (h - sy) * t;
    const x = sx + (foot - sx) * t + (i % 2 ? -1.6 : 1.4);
    return [r1(x), r1(Math.min(y, h))];
  });
  const right = pts.slice(top);
  return pathOf([...right, [r1(foot), h], ...spine.reverse()]);
}

/** Snow above `depth` (share of the box below the summit), with a jagged lower edge. */
function snow(pts, h, summitY, depth) {
  if (!depth) return undefined;
  const line = summitY + depth * (h - summitY);
  let top = 0;
  pts.forEach((q, i) => { if (q[1] < pts[top][1]) top = i; });
  // Walk out from the summit while the ridge stays above the snowline.
  let a = top; while (a > 0 && pts[a - 1][1] < line) a--;
  let b = top; while (b < pts.length - 1 && pts[b + 1][1] < line) b++;
  const cross = (i, j) => {
    const [xa, ya] = pts[i]; const [xb, yb] = pts[j];
    const t = (line - ya) / (yb - ya);
    return [r1(xa + (xb - xa) * t), r1(line)];
  };
  const left = a > 0 ? cross(a, a - 1) : pts[a];
  const right = b < pts.length - 1 ? cross(b, b + 1) : pts[b];
  const cap = [left, ...pts.slice(a, b + 1), right];
  // The lower edge, right to left: teeth that hang below the line, shallow notches between.
  const n = Math.max(3, Math.round((right[0] - left[0]) / 5));
  const teeth = [];
  for (let i = n - 1; i >= 1; i--) {
    const x = left[0] + ((right[0] - left[0]) * i) / n;
    const hang = HANG[i % HANG.length] * depth * (h - summitY) * 0.4;
    const y = Math.max(ridgeY(pts, x) + 1.2, line + hang);
    teeth.push([r1(x), r1(y)]);
  }
  return pathOf([...cap, ...teeth]);
}

const range = ORDER.map((slug) => {
  const top = STYLE[slug].rangeTop;
  const pts = ridge(slug, 100, 100, top);
  return { slug, body: pathOf(pts), shade: shade(pts, 100, 100), snow: snow(pts, 100, top, STYLE[slug].snow) };
});
const card = ORDER.map((slug, band) => {
  const { boxHeight, summitY } = CARD[band];
  const pts = ridge(slug, 100, boxHeight, summitY);
  return { slug, boxHeight, body: pathOf(pts), shade: shade(pts, 100, boxHeight),
    snow: snow(pts, boxHeight, summitY, STYLE[slug].snow) };
});
const everestOutline = ridge('everest', 100, 100, 11);

const q = (s) => (s === undefined ? 'undefined' : `'${s}'`);
const out = `/**
 * GENERATED, DO NOT EDIT BY HAND: \`node tools/peaks/generate-silhouettes.mjs web-ui/src/utils/peakShapes.ts\`.
 *
 * The six catalogue mountains as FILLED shapes (body, shadow face, snow), their ridgelines taken from real elevation
 * profiles (Mapzen Terrain Tiles; SRTM, GMTED2010 and 3DEP courtesy of the U.S. Geological Survey; full attribution
 * in tools/peaks/ATTRIBUTION.txt). The script is the method; read it. Consumers import \`mountainSilhouettes.ts\`
 * and \`rangeSilhouettes.ts\`, not this file.
 */

export interface PeakShape { body: string; shade: string; snow?: string }

/** Range shapes on a \`0 0 100 100\` box (y = 100 is the ground), band 0 to 5. */
export const RANGE_SHAPES: PeakShape[] = [
${range.map((s, i) => `  // ${i}: ${NAMES[i]}\n  { body: ${q(s.body)},\n    shade: ${q(s.shade)},\n    snow: ${q(s.snow)} },`).join('\n')}
];

/** Goal-card shapes on a \`0 0 100 boxHeight\` box, band 0 to 5. */
export const CARD_SHAPES: Array<PeakShape & { boxHeight: number }> = [
${card.map((s, i) => `  // ${i}: ${NAMES[i]}\n  { boxHeight: ${s.boxHeight},\n    body: ${q(s.body)},\n    shade: ${q(s.shade)},\n    snow: ${q(s.snow)} },`).join('\n')}
];

/** Everest's ridge on the card box (\`0 0 100 100\`, summit y = 11), foot to foot, for placing the South Col camps. */
export const EVEREST_OUTLINE: ReadonlyArray<readonly [number, number]> = ${JSON.stringify(everestOutline)};

/** The lowest ground of Everest's cropped transect (the drawn foot), in metres. */
export const EVEREST_FOOT_M = ${Math.round(Math.min(STYLE.everest.floorM ?? Infinity, ...crop(profiles.everest.points, STYLE.everest.crop, STYLE.everest.cropLeft).map((p) => p[1])))};
`;
fs.writeFileSync(process.argv[2] || path.join(here, '../../web-ui/src/utils/peakShapes.ts'), out);
console.log('wrote', process.argv[2]);
