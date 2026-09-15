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
};
