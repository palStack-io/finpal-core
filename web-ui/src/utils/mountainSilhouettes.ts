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

/** Indexed by band, 0 (smallest) to 5 (largest). `BAND_ORDER` on the server. */
export const MOUNTAIN_SILHOUETTES: MountainSilhouette[] = [
  // 0 — Table Mountain, 1,085 m. The flat top and nothing else, so no snow.
  {
    boxHeight: 30,
    body: 'M0,30 L7,27 L17,16 L23,8 L77,7 L83,17 L92,26 L100,30 Z',
  },
  // 1 — Ben Nevis, 1,345 m. Rounded dome with the sheer north face on one side.
  {
    boxHeight: 42,
    body: 'M0,42 L9,37 L24,27 L38,18 L50,13 L57,15 L63,10 L70,13 L74,24 '
        + 'L77,37 L86,40 L100,42 Z',
    snow: 'M63,10 L70,13 L74,24 L67,20 L60,16 Z',
    snowOpacity: 0.7,
  },
  // 2 — Mount Fuji, 3,776 m. Symmetric cone, concave flanks, crater notch.
  {
    boxHeight: 56,
    body: 'M0,56 C22,54 32,44 43,20 L46,12 L48,10 L52,10 L54,12 L57,20 '
        + 'C68,44 78,54 100,56 Z',
    snow: 'M46,12 L48,10 L52,10 L54,12 L57,20 L50,17 L43,20 Z',
    snowOpacity: 0.85,
  },
  // 3 — Mount Rainier, 4,392 m. Broad and glaciated, with a wide snowy summit.
  {
    boxHeight: 68,
    body: 'M0,68 L6,64 L17,50 L29,34 L39,24 L47,19 L58,18 L66,22 L75,32 '
        + 'L85,49 L94,62 L100,68 Z',
    snow: 'M39,24 L47,19 L58,18 L66,22 L75,32 L64,29 L56,32 L47,28 L41,31 Z',
    snowOpacity: 0.85,
  },
  // 4 — Aconcagua, 6,961 m. A massive angular ridge with several sub-peaks.
  {
    boxHeight: 84,
    body: 'M0,84 L8,71 L18,57 L24,62 L34,40 L42,26 L50,14 L58,22 L64,19 '
        + 'L71,33 L79,48 L87,63 L95,75 L100,84 Z',
    snow: 'M50,14 L58,22 L64,19 L69,27 L60,25 L53,29 L46,24 L43,28 L42,26 Z',
    snowOpacity: 0.8,
  },
  // 5 — Everest, 8,849 m. Jagged pyramid, and the shoulder is what names it.
  {
    boxHeight: 100,
    body: 'M0,100 L9,90 L19,77 L27,67 L33,73 L41,48 L47,28 L51,11 L56,21 '
        + 'L60,18 L67,37 L74,52 L82,70 L90,86 L100,100 Z',
    snow: 'M51,11 L56,21 L60,18 L65,29 L57,27 L50,32 L44,26 L46,33 L47,28 Z',
    snowOpacity: 0.85,
  },
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
