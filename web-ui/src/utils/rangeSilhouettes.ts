/**
 * Peak shapes for the DASHBOARD RANGE, which are not the peak shapes for a
 * goal card — and the reason is aspect ratio.
 *
 * *** REUSING `MOUNTAIN_SILHOUETTES` HERE PRODUCED HILLS, NOT MOUNTAINS. ***
 * Those shapes are authored on a `0 0 100 boxHeight` viewBox where `boxHeight`
 * runs 30 to 100, so a band-0 Table Mountain is 100 wide by 30 tall — better
 * than 3:1. That is correct for its job: a wide, low backdrop sitting behind
 * the text of one goal card. Put four side by side on a shared ground line and
 * you get a row of mounds. The mockup's Rainier is about 336 x 214, nearer
 * 1.6:1, and that steepness is most of why it reads as a mountain range.
 *
 * So this is a second table, deliberately, and the duplication is bounded: it
 * holds GEOMETRY ONLY for one context, keyed by the same band index, and
 * nothing else in the app consumes it. The alternative — squashing the card
 * shapes horizontally — distorts paths the design spec explicitly says must
 * never be distorted (section 4.1), and would make Table Mountain's flat top
 * the wrong width relative to its own shoulders.
 *
 * *** WHAT IS PRESERVED ACROSS BOTH TABLES IS IDENTITY, NOT COORDINATES. ***
 * Band 0 is still flat-topped, because that flat top IS Table Mountain. Bands
 * 4 and 5 still carry the twin summit. A reader who has seen a goal card should
 * recognise the same mountain here.
 *
 *
 * *** THIS FILE EXISTS TWICE, BYTE-IDENTICALLY, AND NEITHER COPY SAID SO UNTIL
 * D-258. *** `finpal_core/web-ui/src/utils/rangeSilhouettes.ts` and
 * `mobile/src/utils/rangeSilhouettes.ts` are separate git repos with nothing to
 * import between them — the convention `mountainGeometry.ts` established and
 * states in its own header. **Change one, change both, in the same turn, and
 * `diff` them.** Byte-identity is the whole guarantee: a peak drawn one way on
 * web and another on the phone is two answers to one question.
 *
 * *** AND THE OMISSION ITSELF WAS THE DEFECT. *** Mobile had only the goal-CARD
 * table (`mountainSilhouettes.ts`, authored `0 0 100 boxHeight` with `boxHeight`
 * 30..100), so scaling a band-0 shape to a pixel HEIGHT made it 3.3x as WIDE as
 * tall — over 300 units in a 320-unit viewBox. The dashboard range drew one
 * mountain where web drew five, through four attempts. That is why the note
 * above is not housekeeping.
 * Every path is on a `0 0 100 100` box: x is the full base width, y=100 is the
 * ground and y=0 is the summit. The caller scales uniformly.
 */

export interface RangeSilhouette {
  /** The mountain, filled with `currentColor`. */
  body: string;
  /**
   * The shaded face — the same mountain's right-hand side, drawn over the body
   * at low opacity so the peak has a lit side and a dark side. This is the
   * single thing that stopped the range looking like flat paper cut-outs.
   */
  shade?: string;
  /** Snow, drawn last. Table Mountain has none: the flat top is its identity. */
  snow?: string;
  snowOpacity?: number;
}

/**
 * Indexed by band, 0 (Table Mountain) to 5 (Everest) — the same order the
 * server's `BAND_ORDER` uses and the same order the card silhouettes use.
 */
export const RANGE_SILHOUETTES: RangeSilhouette[] = [
  // 0 — Table Mountain. Flat top, wide shoulders, no snow.
  {
    body: 'M0,100 L14,74 L30,40 L70,38 L86,72 L100,100 Z',
    shade: 'M70,38 L86,72 L100,100 L58,100 Z',
  },
  // 1 — Ben Nevis. One summit, asymmetric, a light cap.
  {
    body: 'M0,100 L18,72 L40,34 L52,12 L64,30 L82,68 L100,100 Z',
    shade: 'M52,12 L64,30 L82,68 L100,100 L54,100 Z',
    snow: 'M52,12 L64,30 L57,26 L49,31 L44,25 Z',
    snowOpacity: 0.5,
  },
  // 2 — a steeper single summit.
  {
    body: 'M0,100 L14,76 L34,38 L50,8 L62,26 L80,66 L100,100 Z',
    shade: 'M50,8 L62,26 L80,66 L100,100 L52,100 Z',
    snow: 'M50,8 L62,26 L54,22 L46,28 L40,20 Z',
    snowOpacity: 0.62,
  },
  // 3 — Mount Rainier. Broad shoulders, a wide snowfield, a subsidiary bump.
  {
    body: 'M0,100 L12,78 L28,44 L44,10 L54,2 L62,14 L72,10 L86,62 L100,100 Z',
    shade: 'M54,2 L62,14 L72,10 L86,62 L100,100 L56,100 Z',
    snow: 'M44,10 L54,2 L62,14 L72,10 L78,30 L68,24 L58,34 L48,22 L40,30 Z',
    snowOpacity: 0.9,
  },
  // 4 — twin summit, the second slightly lower.
  {
    body: 'M0,100 L10,80 L24,46 L38,6 L48,18 L58,4 L70,22 L86,64 L100,100 Z',
    shade: 'M58,4 L70,22 L86,64 L100,100 L60,100 Z',
    snow: 'M38,6 L48,18 L58,4 L70,22 L62,20 L54,30 L44,18 L34,26 Z',
    snowOpacity: 0.92,
  },
  // 5 — Everest. The tallest, the sharpest, the most snow.
  {
    body: 'M0,100 L8,82 L22,48 L36,12 L46,0 L56,14 L66,6 L82,60 L100,100 Z',
    shade: 'M46,0 L56,14 L66,6 L82,60 L100,100 L48,100 Z',
    snow: 'M36,12 L46,0 L56,14 L66,6 L74,32 L64,26 L54,38 L44,24 L34,32 Z',
    snowOpacity: 0.95,
  },
];

/**
 * A goal finPal cannot measure: a flat ridge, no summit, no snow.
 *
 * Drawn rather than omitted because "we do not know how big this is" is itself
 * a fact worth showing — but it must never look like a climb.
 */
export const RANGE_UNMEASURED: RangeSilhouette = {
  body: 'M0,100 L20,86 L44,80 L70,84 L100,100 Z',
};

/*
 * *** A FINISHED GOAL HITS THIS FLOOR, AND IT STILL HAS TO LOOK LIKE SOMETHING
 * SOMEBODY CLIMBED. *** A build goal at zero magnitude is DONE, so its honest
 * height is zero — but drawing it at zero says "this never existed" rather
 * than "you finished this". At 0.18 Table Mountain rendered as a green nub
 * with its flat top invisible, and that flat top is the whole identity of that
 * particular mountain. 0.30 keeps the shape readable while leaving it
 * obviously the smallest thing in the range.
 */
export const MIN_RANGE_HEIGHT = 0.30;
