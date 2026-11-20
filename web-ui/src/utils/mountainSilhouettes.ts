/**
 * The six silhouettes, plus the one shape that is deliberately not a mountain.
 *
 * *** THESE ARE DRAWN FROM THE REAL MOUNTAINS, NOT FROM TRIANGLES. *** The band
 * ladder has to be legible with its labels removed, which a stack of triangles
 * at six sizes is not: Table Mountain IS its flat top, Fuji IS a symmetric cone
 * with concave flanks, Everest has its shoulder. Approved from
 * `docs/mockups/silhouettes.html`, which is the source of these paths.
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

import { boxSilhouette, profileFor } from './realRange';

export interface MountainSilhouette {
  /** The viewBox is `0 0 100 boxHeight`. Taller band, taller box. */
  boxHeight: number;
  /** The mountain itself. Filled with `currentColor` so it takes the scale's colour. */
  body: string;
  /** Snow, drawn over the body. Table Mountain has none -- the flat top is the whole identity. */
  snow?: string;
  /** Snow is lighter on some shapes than others; taken from the approved mockup. */
  snowOpacity?: number;
}

/*
 * *** SINCE 2026-11-20 THESE ARE GENERATED FROM REAL ELEVATION, NOT TRACED BY HAND (design move 3). *** Each body is
 * the mountain's real profile (`peakProfiles.ts`, one transect through the surveyed summit, public elevation data)
 * fitted to its band's box by `boxSilhouette`: the transect spans the 100-wide box and its relief, from the lowest
 * ground it crosses to the summit, spans the box height down from the same summit line the hand-traced shapes used.
 * The hand-drawn snow caps are gone: they belonged to the traced outlines and do not fit the real ones.
 */
const glyph = (slug: string, boxHeight: number, summitY: number): MountainSilhouette =>
  ({ boxHeight, body: boxSilhouette(profileFor(slug)!, 100, boxHeight, summitY) });

/** Indexed by band, 0 (smallest) to 5 (largest). `BAND_ORDER` on the server. */
export const MOUNTAIN_SILHOUETTES: MountainSilhouette[] = [
  glyph('table-mountain', 30, 7),     // 1,085 m. The flat front table.
  glyph('ben-nevis', 42, 10),         // 1,345 m. The summit plateau, then Carn Mor Dearg.
  glyph('mount-fuji', 56, 10),        // 3,776 m. The cone.
  glyph('mount-rainier', 68, 18),     // 4,392 m. Broad and glaciated.
  glyph('aconcagua', 84, 14),         // 6,961 m.
  glyph('everest', 100, 11),          // 8,849 m.
];

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
