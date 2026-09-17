/**
 * The ridge band under a page title.
 *
 * *** THE PATHS LIVE HERE RATHER THAN AT THE CALL SITES, FOR THE REASON
 * `rangeSilhouettes.ts` EXISTS. *** A 200-character `d` attribute pasted into
 * eleven pages is eleven things to keep in step and eleven chances for one page
 * to drift into a ridge nobody drew. A page asks for a band by name; the
 * geometry is one file.
 *
 * Each page gets its OWN ridge on purpose. The band is what gives a page an
 * identity in one glance — the thing the live app lacked, where every page
 * opened with the same 32px title on the same empty wash — so a shared path
 * would defeat the point of having one.
 *
 * Coordinates are a `0 0 1100 52` box drawn with `preserveAspectRatio="none"`,
 * which stretches rather than clips: at 390px the ridges read steeper, and that
 * is the intended behaviour. It is NOT the trap `GoalRange` hit, where `meet`
 * plus a fixed height scaled a 1100-wide drawing down to 340x77 and parked it
 * under 170px of dead space — `none` fills the box at every width by
 * definition, and there is no text inside the band to shrink.
 */
export interface HeadBand {
  /** The ridge outline, closed along the bottom of the box. */
  d: string;
  /** How present the ridge is. Denser pages get a quieter band. */
  opacity: number;
  /**
   * An optional second path, drawn UNDER the ridge. Only Recurring uses one,
   * and it is not decoration: a solid bar along the bottom is the ground, which
   * is what that page is about. A page whose band says something gets to say it.
   */
  base?: { d: string; opacity: number };
}

export const HEAD_BANDS: Record<string, HeadBand> = {
  /* Tall and open — Accounts is where the debt figures live and the page is short. */
  accounts: {
    d: 'M0,52 L130,24 L230,52 L360,32 L470,52 L600,20 L720,52 L860,30 L960,52 L1100,38 L1100,52 Z',
    opacity: 0.38,
  },
  /* The quietest band in the set. Transactions is the density test — many rows,
     and a loud ridge behind the first one competes with them. */
  transactions: {
    d: 'M0,52 L100,34 L190,52 L300,28 L410,52 L520,36 L640,52 L780,26 L880,52 L1010,38 L1100,52 Z',
    opacity: 0.33,
  },
  /* Goals is the page the range vocabulary comes from, so its ridge is the most
     mountainous of the three. */
  goals: {
    d: 'M0,52 L90,22 L160,52 L250,30 L330,52 L440,14 L540,52 L660,26 L750,52 L880,32 L970,52 L1100,36 L1100,52 Z',
    opacity: 0.45,
  },
  /* The only band with a base: a solid bar across the bottom, because this page
     IS the ground. The ridges sit behind it, quieter than anywhere else. */
  recurring: {
    d: 'M0,52 L150,30 L260,52 L400,24 L520,52 L660,32 L780,52 L920,26 L1020,52 L1100,42 L1100,52 Z',
    opacity: 0.3,
    base: { d: 'M0,44 L1100,44 L1100,52 L0,52 Z', opacity: 0.5 },
  },
  /* Categories is the longest list in the app; a mid-weight ridge keeps the
     three-way split below it as the thing the eye lands on. */
  categories: {
    d: 'M0,52 L120,26 L220,52 L340,20 L450,52 L580,30 L690,52 L830,22 L930,52 L1100,36 L1100,52 Z',
    opacity: 0.4,
  },
  /* Analytics is charts: the quietest ridge after Transactions, so it does not
     compete with a donut and two bar charts. */
  analytics: {
    d: 'M0,52 L110,32 L200,52 L320,26 L430,52 L560,34 L680,52 L820,24 L920,52 L1040,36 L1100,52 Z',
    opacity: 0.34,
  },
  /* Review is the way up: the sharpest ridge in the set, because clearing it is
     what makes every other figure in the app worth reading. */
  review: {
    d: 'M0,52 L120,28 L210,52 L320,18 L430,52 L560,30 L660,52 L800,22 L900,52 L1100,34 L1100,52 Z',
    opacity: 0.4,
  },
  /* Budgets: coverage is its headline, so a broad even ridge rather than a
     dramatic one. */
  budgets: {
    d: 'M0,52 L140,30 L250,52 L380,24 L500,52 L640,30 L760,52 L900,26 L1000,52 L1100,40 L1100,52 Z',
    opacity: 0.38,
  },
  /* The dashboard's own band is the quietest of all: the goal range sits
     directly below it and two ranges competing is one too many. */
  /* Groups: shared costs, so an even social ridge rather than a dramatic one. */
  groups: {
    d: 'M0,52 L150,32 L270,52 L400,26 L520,52 L670,30 L790,52 L930,24 L1030,52 L1100,38 L1100,52 Z',
    opacity: 0.34,
  },
  /* Rules is a list of things the user taught it — a plain ridge, mid weight. */
  rules: {
    d: 'M0,52 L130,28 L240,52 L370,22 L480,52 L620,32 L740,52 L880,24 L980,52 L1100,38 L1100,52 Z',
    opacity: 0.36,
  },
  /* Investments RISES left to right — the only band that trends, because the
     page is about a gap that has grown. Each peak clears the one before it
     (24 -> 20 -> 16 -> 12) rather than alternating like the others. It is a
     shape, NOT a claim about this user's return: a portfolio that is down
     still gets this ridge, because the alternative is a page whose decoration
     argues with its own figures. */
  investments: {
    d: 'M0,52 L140,40 L250,52 L390,32 L500,52 L650,24 L770,52 L910,18 L1020,52 L1100,14 L1100,52 Z',
    opacity: 0.32,
  },
  /* *** learnPal's BAND IS A STAIRCASE, AND THAT IS THE ONE THING ITS PAGES
     ARE ABOUT. *** Every other ridge here is a range: peaks at whatever heights
     the page's character suggests. learnPal is lessons that unlock from your own
     figures rather than on a schedule, and its own design doc calls the sequence
     a climb — so the ridge steps UP in even increments (46, 40, 34, 28, 22, 16,
     10) instead of wandering. It reads as progress rather than as scenery, which
     is the distinction the module exists to make.

     Quieter than Investments at 0.26: these pages carry a tally row and a long
     prose card, and a busy page gets a quieter band — the rule stated at
     `HeadBand.opacity`. */
  learnpal: {
    /* *** 0.34, NOT 0.26, AND THE STEPS ARE DEEPER THAN THE FIRST DRAFT. ***
       Rendered at 0.26 with a 46->10 rise, the staircase read as a vague
       horizon: `--head-ridge` (#B7CBBC) on `--head-sky` (#DCE7DE) is a quiet
       pair by design, and a shallow shape in a quiet pair is no shape at all.
       A band that is meant to SAY something has to be legible enough to say it,
       which is the difference between this one and the ridges that are only
       scenery. Seen by rendering the capture, not decided from the numbers. */
    d: 'M0,52 L110,50 L220,50 L240,42 L370,42 L390,34 L520,34 L540,26 L670,26 '
      + 'L690,18 L820,18 L840,10 L970,10 L990,4 L1100,4 L1100,52 Z',
    opacity: 0.34,
  },
  /* *** pointsPal's BAND IS A CAP LINE, NOT A RANGE, AND THAT IS THE ONE FACT
     THE MODULE EXISTS TO TELL YOU. *** Every other ridge here is peaks at
     whatever heights suit the page; learnPal's is a staircase because that
     module is about progress. pointsPal is about CEILINGS — a 3x category earns
     3x until you hit the cap and then it does not — so peaks that would have
     gone higher are CUT FLAT, and the two that have not reached the cap rise
     freely. The flats all sit at y=20, which is where `PageHead` draws nothing:
     the line itself is not in this path, because a `HeadBand` is one filled
     ridge and a dashed rule is a second stroke. *** SO THE CAP IS READ FROM THE
     FLATS BEING LEVEL WITH EACH OTHER *** rather than from a drawn line, which
     is quieter and survives the band being 52px tall.

     Verified by rendering the shape alone at 4x, because at 52px the difference
     between "the flats are level" and "nearly level" is two pixels. */
  pointspal: {
    d: 'M0,52 L70,34 L120,34 L180,52 L250,20 L360,20 L420,52 L500,38 L560,38 '
      + 'L620,52 L700,20 L820,20 L880,52 L960,30 L1020,30 L1075,52 L1100,46 L1100,52 Z',
    opacity: 0.42,
  },
};
