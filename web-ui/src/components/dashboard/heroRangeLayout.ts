/**
 * Where everything in the Dashboard hero's range stands (Dashboard C, 2026-11-20). Pure, so the drawing and its
 * tests agree on every position.
 *
 * One overlapping range, not a row of icons: Everest at the back (the climb everyone shares, 8,849 m), the goal
 * peaks stepping forward around its base, tallest nearest the middle, alternating left and right. Every shape is
 * scaled uniformly (never stretched). Labels hang over their own summit, are kept inside the drawing, and are
 * lifted when two would overlap.
 *
 * The climber's point on Everest is NOT computed here: it is `everestRoute.ts` (`placeEverest` / `climbPoint`), the
 * South Col route with every camp at its real elevation, fed with the altitude from acts (never money).
 */
import { SUMMIT_X, placeEverest, type Placement } from '../../utils/everestRoute';

/** One goal peak going in: its drawn height share (0..1, from the goal's size: `goalPeakHeight`) and its label. */
export interface RangeInput {
  id: string;
  height: number;
  /** The range box summit (`[x, y]` on `0 0 100 100`) of the shape this peak is drawn with. */
  summit: readonly [number, number];
  label: string;
  /** The second label line (the kind word: "saving" / "debt"), always printed (D-269). */
  sub: string;
}

export interface PlacedPeak {
  id: string;
  /** The shape's box origin and its scale (the box is 100 x 100); `sx = scale * WIDEN` for every peak alike. */
  x: number;
  y: number;
  scale: number;
  sx: number;
  /** The summit in drawing units. */
  summitX: number;
  summitY: number;
  /** Paint order: lower first (further back). */
  order: number;
}

export interface PlacedLabel {
  id: string;
  /** Centre x of the label block and the baseline of its first line. */
  cx: number;
  y: number;
  width: number;
  /** The summit the label names, for a leader line. */
  anchorX: number;
  anchorY: number;
}

export interface RangeLayout {
  width: number;
  height: number;
  groundY: number;
  everest: { place: Placement; summitX: number; summitY: number; approachX: number } | null;
  peaks: PlacedPeak[];
  labels: PlacedLabel[];
  /** True when some label found no free spot: the caller draws wider (and lets the art scroll). */
  crowded: boolean;
}

export interface LayoutOptions {
  width: number;
  height: number;
  hasEverest: boolean;
  /** Everest's label (one line). */
  everestLabel?: string;
  /** Where Everest's summit stands, as a share of the width (the hero puts it left of centre on a wide screen). */
  everestAt?: number;
}

/**
 * *** ONE HORIZONTAL FACTOR FOR EVERY PEAK IN THE DRAWING. *** The shapes are authored on a square box, which draws a
 * 4 km peak as a needle at this size. Widening each one by the same factor is a vertical exaggeration chosen once for
 * the whole drawing (as any published elevation profile does), never a per-shape stretch: relative widths and every
 * ridgeline's shape are kept. Everest and its route take the same factor (`placeEverest(..., WIDEN)`).
 */
export const WIDEN = 1.4;

/** The ground band at the foot of the drawing, in drawing units. */
export const GROUND_H = 30;
/** Room above Everest's summit for its label. */
const TOP_ROOM = 34;
const MARGIN = 16;
const LINE = 15;
/** A label's block height: two lines. */
export const LABEL_H = LINE * 2 + 2;
/** Shortest drawn goal, as a share of the tallest (a finished goal still reads as something climbed). */
export const MIN_SHARE = 0.3;

/** Width of a line of label text at 13px Outfit, a little generous so a clamp never cuts a glyph. */
export const textWidth = (text: string): number => Math.ceil(text.length * 7.6) + 12;

/** Tallest-first items arranged so the tallest stand nearest the middle: [.., 3, 1, 0, 2, 4, ..]. */
export function intoRangeOrder<T>(sortedDescending: T[]): { left: T[]; right: T[] } {
  const left: T[] = [];
  const right: T[] = [];
  sortedDescending.forEach((item, i) => { (i % 2 === 0 ? left : right).push(item); });
  return { left, right };
}

const overlaps = (a: PlacedLabel, b: PlacedLabel) =>
  Math.abs(a.cx - b.cx) < (a.width + b.width) / 2 + 6 && Math.abs(a.y - b.y) < LABEL_H;

/**
 * Keep every label inside the drawing, then move any that collide with one already placed: to the nearest height
 * (above or below its own spot, between `minY` and `maxY`) where it overlaps nothing. Highest summits are placed
 * first and keep their spot.
 */
export function settleLabels(labels: PlacedLabel[], width: number, minY: number, maxY = Infinity):
  { labels: PlacedLabel[]; crowded: boolean } {
  const placed: PlacedLabel[] = [];
  let crowded = false;
  for (const l of [...labels].sort((a, b) => a.anchorY - b.anchorY)) {
    const half = l.width / 2;
    const base = { ...l, cx: Math.min(Math.max(l.cx, half + 4), width - half - 4) };
    const ys = [base.y, ...placed.flatMap((p) => [p.y + LABEL_H + 2, p.y - LABEL_H - 2])]
      .filter((y) => y >= minY && y <= maxY);
    // Then sideways, a little at a time, still inside the drawing.
    const xs = [0, -24, 24, -48, 48, -72, 72].map((dx) => Math.min(Math.max(base.cx + dx, half + 4), width - half - 4));
    const spots = ys.flatMap((y) => xs.map((cx) => ({ cx, y })))
      .sort((a, b) => (Math.abs(a.y - base.y) + Math.abs(a.cx - base.cx)) - (Math.abs(b.y - base.y) + Math.abs(b.cx - base.cx)));
    const spot = spots.find((c) => !placed.some((p) => overlaps(p, { ...base, ...c })));
    if (!spot) crowded = true;
    placed.push({ ...base, ...(spot ?? {}) });
  }
  return { labels: labels.map((l) => placed.find((p) => p.id === l.id)!), crowded };
}

export function layoutRange(goals: RangeInput[], opts: LayoutOptions): RangeLayout {
  const { width, height, hasEverest } = opts;
  const groundY = height - GROUND_H;
  const peaks: PlacedPeak[] = [];
  const labels: PlacedLabel[] = [];

  let everest: RangeLayout['everest'] = null;
  let centre = width / 2;
  let goalCeiling = groundY - TOP_ROOM - LABEL_H - 8;
  if (hasEverest) {
    centre = width * (opts.everestAt ?? 0.5);
    const summitY = TOP_ROOM;
    const place = placeEverest(centre, summitY, groundY, WIDEN);
    // The trail starts at Everest's own left foot, so the route never crosses a goal peak in front.
    everest = { place, summitX: centre, summitY, approachX: centre - (SUMMIT_X - 8) * (place.sx ?? place.scale) };
    // Goals stand in front of Everest, well below its summit, so its label and the climb stay clear.
    goalCeiling = (groundY - summitY) * 0.6;
    const text = opts.everestLabel ?? '';
    labels.push({ id: 'everest', cx: centre, y: summitY - 10, width: textWidth(text), anchorX: centre, anchorY: summitY });
  }

  const sorted = [...goals].sort((a, b) => b.height - a.height);
  const tallest = sorted.length ? Math.max(sorted[0].height, 1e-6) : 1;
  const { left, right } = intoRangeOrder(sorted);

  const drawnHeight = (g: RangeInput) => Math.max(g.height / tallest, MIN_SHARE) * goalCeiling;
  const place = (g: RangeInput, cx: number, order: number) => {
    // The range box is 100 x 100 and its summit sits at the shape's own `summit` y; scale so the drawn summit is
    // `drawnHeight` above the ground.
    const h = drawnHeight(g);
    const scale = h / (100 - g.summit[1]);
    const sx = scale * WIDEN;
    const x = cx - g.summit[0] * sx;
    const y = groundY - 100 * scale;
    const summitX = cx;
    const summitY = y + g.summit[1] * scale;
    peaks.push({ id: g.id, x, y, scale, sx, summitX, summitY, order });
    // + room for the finished tick drawn after a label.
    const w = Math.max(textWidth(g.label), textWidth(g.sub)) + 16;
    labels.push({ id: g.id, cx: summitX, y: summitY - LABEL_H - 2, width: w, anchorX: summitX, anchorY: summitY });
  };

  if (hasEverest) {
    // Each side fills the space between the margin and Everest's foot, nearest first.
    const sides: Array<[RangeInput[], number]> = [[left, -1], [right, 1]];
    for (const [list, dir] of sides) {
      const span = dir < 0 ? centre - MARGIN : width - MARGIN - centre;
      list.forEach((g, k) => {
        const cx = centre + dir * span * ((k + 0.85) / (list.length + 0.35));
        // Nearer Everest = further back; the outer peaks step forward.
        place(g, cx, 1 + k);
      });
    }
  } else {
    const order = [...left].reverse().concat(right);
    order.forEach((g, i) => {
      const cx = MARGIN + ((width - 2 * MARGIN) * (i + 0.5)) / order.length;
      place(g, cx, 1 + Math.abs(i - order.length / 2));
    });
  }

  const settled = settleLabels(labels, width, 14, groundY - LABEL_H);
  return {
    width, height, groundY, everest,
    peaks: peaks.sort((a, b) => a.order - b.order),
    labels: settled.labels,
    crowded: settled.crowded,
  };
}

/**
 * The layout at `width`, or, when the labels cannot all fit there, at the narrowest wider width (in 15% steps, up to
 * twice as wide) where they do. The caller lets the art scroll sideways when the result is wider than its box.
 */
export function layoutRangeFitting(goals: RangeInput[], opts: LayoutOptions): RangeLayout {
  let layout = layoutRange(goals, opts);
  for (let k = 1; layout.crowded && k <= 7; k++) {
    layout = layoutRange(goals, { ...opts, width: Math.round(opts.width * (1 + 0.15 * k)) });
  }
  return layout;
}
