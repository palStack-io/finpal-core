/**
 * The six silhouettes, plus the one shape that is deliberately not a mountain.
 *
 * *** THESE ARE DRAWN FROM THE REAL MOUNTAINS, NOT FROM TRIANGLES. *** The band
 * ladder has to be legible with its labels removed, which a stack of triangles
 * at six sizes is not: Table Mountain IS its flat top, Fuji IS a symmetric cone
 * with concave flanks, Everest has its shoulder. Approved from
 * `docs/mockups/silhouettes.html`; since Dashboard C (2026-11-20) the outlines come from real elevation
 * profiles (see the table below).
 *
 * *** EVERY SILHOUETTE IN THAT MOCKUP CARRIES `preserveAspectRatio="none"`, AND
 * COPYING THAT WOULD UNDO THE WHOLE POINT. *** It is exactly the stretching the
 * design forbids: shape comes from the band, size comes from the magnitude, and
 * a stretched Table Mountain stops being Table Mountain. The mockup gets away
 * with it because each of its grid cells happens to be about 100px wide -- the
 * same as the viewBox -- so its distortion is zero by coincidence and appears
 * at any other width. See the design spec, section 4.1.
 *
 * Each band's box is `100 x boxHeight`, and `boxHeight` RISES with the band.
 * That is what makes uniform scaling and the ladder the same thing: render at
 * any width W and the height follows as `W * boxHeight / 100`, so a taller band
 * is a taller mountain without a single stretched path.
 */

import { CARD_SHAPES } from './peakShapes';

export interface MountainSilhouette {
  /** The viewBox is `0 0 100 boxHeight`. Taller band, taller box. */
  boxHeight: number;
  /** The mountain itself. Filled with `currentColor` so it takes the scale's colour. */
  body: string;
  /** The shadow face (right of a spine from the summit), drawn over the body in a dark wash: the lit and the
   *  shaded side of the same peak. */
  shade?: string;
  /** Snow, drawn over the body. Table Mountain has none -- the flat top is the whole identity. */
  snow?: string;
  /** Snow is lighter on some shapes than others. */
  snowOpacity?: number;
}

/**
 * Indexed by band, 0 (smallest) to 5 (largest). `BAND_ORDER` on the server.
 *
 * *** SINCE 2026-11-20 (DASHBOARD C) THE RIDGELINES ARE REAL. *** Each shape is generated from that mountain's
 * real elevation profile by `tools/peaks/generate-silhouettes.mjs` (`peakShapes.ts`): the hand-drawn outlines were
 * close to triangles. The box ladder (30 to 100) and the rule that a shape is never stretched are unchanged.
 */
const SNOW_OPACITY = [undefined, 0.8, 0.9, 0.92, 0.9, 0.95];
export const MOUNTAIN_SILHOUETTES: MountainSilhouette[] = CARD_SHAPES.map((s, band) => ({
  boxHeight: s.boxHeight,
  body: s.body,
  shade: s.shade,
  ...(s.snow ? { snow: s.snow, snowOpacity: SNOW_OPACITY[band] } : {}),
}));

/**
 * *** NOT A MOUNTAIN, AND THAT IS THE ENTIRE REQUIREMENT. ***
 *
 * "We do not know your rate" is not a SMALL mountain, and the two must never
 * look alike -- so this has no summit, no snow and no elevation. It is a low
 * undulating ridge: recognisably a shape, recognisably not a peak, and it takes
 * a muted colour rather than either scale's.
 *
 * The mockup states this rule in prose and never draws one, so this path is new.
 * It is deliberately BUMPY rather than a straight line, because a straight line
 * reads as a rule or a divider rather than as terrain.
 */
export const UNMEASURED_RIDGE: MountainSilhouette = {
  boxHeight: 14,
  body: 'M0,14 L14,11 L27,12.5 L41,10.5 L55,12 L69,10.5 L84,12 L100,14 Z',
};

/**
 * The smallest height a MEASURED peak may render at.
 *
 * *** AN EXPLICIT 0% APR IS MEASURED, NOT UNMEASURED. *** `monthlyInterestCost`
 * returns `null` only when NO account states a rate; a real balance on a 0% card
 * gives a magnitude of 0, so the arithmetic says height 0 and the peak would be
 * invisible -- indistinguishable from a broken card. A 0% balance transfer is
 * common, and "this costs you nothing" is the most encouraging thing a goal card
 * can say, so it gets drawn.
 *
 * *** THE FLOOR LIVES HERE AND NOT IN `mountainGeometry.ts`. *** `height: 0` for
 * a magnitude of 0 is arithmetically honest and the geometry module is shared
 * byte-for-byte with mobile; a purely presentational minimum does not belong in
 * a module where changing it means changing two repos in lockstep.
 *
 * Chosen to sit just below the unmeasured ridge's own box height, so the
 * smallest real mountain is never drawn shorter than the "we don't know" shape.
 */
export const MIN_MEASURED_HEIGHT = 12;
