/**
 * How tall a peak is drawn, for learnPal's range (C1c).
 *
 * *** TWO SCALES THAT ARE NEVER COMPARED TO EACH OTHER, ABOVE A GROUND LAYER. ***
 * Owner decisions 12 and 13, 2026-09-10, replacing a one-axis version whose own
 * worked example inverted the picture the owner had approved: House $767/mo >
 * Fund $347/mo > Visa $80/mo, savings towering over debt.
 *
 * The bug was not the ordering. It was that one axis mixed **a cost inflicted on
 * you** with **a commitment you set yourself** — a savings goal's monthly demand
 * comes from a target date the user chose, so moving it from three years to six
 * halved the mountain with nothing real having changed. Debt's cost cannot be
 * gamed that way.
 *
 * So: **height is what it costs you to do nothing.** Only debt has such a cost.
 *
 *   "WHAT'S COSTING YOU"  (paydown)   monthly interest bleed
 *   "WHAT YOU'RE BUILDING" (accumulate) distance remaining
 *
 * Separate headings, separate ceilings, never one legend.
 *
 * *** THE SAME FUNCTION EXISTS IN THE OTHER CLIENT AND THE TWO TEST FILES PIN
 * THE SAME CASE TABLE ON PURPOSE. *** web-ui and mobile are separate git repos
 * with nothing to import between them; `goalFigures.ts` and `goalTracking.ts`
 * established the convention. **Change one, change both, in the same turn.**
 * These two files are byte-identical; `diff` them.
 *
 * *** THIS MODULE DRAWS NOTHING. *** It returns numbers and an `unmeasured`
 * flag. The artwork — six World-set silhouettes and the band table — is content
 * that does not exist yet, which is exactly why the arithmetic is separated from
 * it: this half is testable today and the other half is not blocked by it.
 */

/** `GoalService.direction` — DERIVED from the amounts, never `Goal.kind`. */
export type PeakDirection = 'paydown' | 'accumulate';

export interface PeakAccount {
  /** Balance in BASE currency. Card debt is NEGATIVE — see `monthlyInterestCost`. */
  balance?: number | null;
  /** Annual percentage rate. `null` means NOT STATED, and that is not zero. */
  apr?: number | null;
}

export interface PeakInput {
  direction: PeakDirection;
  /** Only read for `paydown`. One entry per linked account (B12: a goal can span several). */
  accounts?: PeakAccount[];
  /** Only read for `accumulate`. Both in BASE currency. */
  targetAmount?: number | null;
  currentAmount?: number | null;
  /**
   * False when a figure could not be converted to base currency. **No usable
   * rate means UNMEASURED, never guessed** — otherwise the bands are silently
   * dollar-shaped and a ¥-denominated goal lands absurdly.
   */
  convertible?: boolean;
}

export interface PeakGeometry {
  /** 0..maxHeight, or 0 when unmeasured. Never negative. */
  height: number;
  /**
   * The raw quantity behind the height, in base currency: monthly interest for
   * a paydown peak, distance remaining for an accumulate one. `null` when
   * unmeasured. Exposed so a caption can state the real figure rather than
   * reverse-engineering it from a pixel height.
   */
  magnitude: number | null;
  /**
   * *** GREY, NOT SHORT. *** A missing APR must never draw a molehill — that is
   * parent-spec trap 3, and D-77 and D-108 are what it looks like when it goes
   * wrong. The caller renders these as explicitly unmeasured with a prompt to
   * add a rate, which is the whole reason C1a exists.
   */
  unmeasured: boolean;
  /** Which scale this peak belongs to. Callers must not mix the two. */
  scale: PeakDirection;
}

export interface Ceilings {
  /** Monthly interest, base currency, at which a paydown peak hits full height. */
  costCeiling: number;
  /** Distance remaining, base currency, at which an accumulate peak hits full height. */
  buildCeiling: number;
  maxHeight: number;
}

/**
 * *** PROPOSED, NOT APPROVED. §18 ITEM 1 — THE BAND TABLE — IS UNANSWERED. ***
 * These are placeholders so the arithmetic is testable and the shape of the
 * answer is visible. They are deliberately parameters rather than constants:
 * the caller passes ceilings, so settling the band table later is a change at
 * one call site and not a change to this file.
 *
 * The reasoning behind the numbers, so the owner has something to react to
 * rather than a blank: £250/month of interest is severe for a household budget
 * and a sensible "as tall as it gets"; £20,000 remaining is a large but
 * reachable savings target. Both are in BASE currency.
 */
export const PROPOSED_CEILINGS: Ceilings = {
  costCeiling: 250,
  buildCeiling: 20000,
  maxHeight: 100,
};

/**
 * Monthly interest, in base currency. `null` when NO account states a rate.
 *
 * *** CARD DEBT IS A NEGATIVE BALANCE. *** `balances.py::_move` applies one rule
 * for every account type, so an owed 1,125.41 is stored as -1125.41 and the
 * amount accruing interest is `-balance`. Writing `Math.abs` here would charge
 * interest on an OVERPAID card — money the bank owes the user — which is D-176's
 * arithmetic exactly.
 *
 * An account with a rate but no debt contributes 0 and still counts as
 * MEASURED: "you owe nothing on this card" is a real answer, not a missing one.
 */
export function monthlyInterestCost(accounts: PeakAccount[] | undefined | null): number | null {
  if (!accounts || accounts.length === 0) return null;

  let total = 0;
  let anyRate = false;
  for (const account of accounts) {
    // `== null` catches undefined too, and deliberately does NOT catch 0 — a 0%
    // intro rate is a stated rate and makes the peak measured at zero cost.
    if (account.apr == null) continue;
    anyRate = true;
    const owed = Math.max(0, -(account.balance ?? 0));
    total += (owed * account.apr) / 100 / 12;
  }
  return anyRate ? total : null;
}

/**
 * `sqrt` compression, clamped at the ceiling.
 *
 * Square root rather than linear so the difference between a small peak and a
 * medium one stays visible — linear would flatten every ordinary debt into the
 * foothills of one outlier. Anything above the ceiling CLAMPS rather than
 * running off the canvas.
 */
function scaleHeight(magnitude: number, ceiling: number, maxHeight: number): number {
  if (!(ceiling > 0)) return 0;
  const ratio = Math.min(1, Math.max(0, magnitude) / ceiling);
  return maxHeight * Math.sqrt(ratio);
}

/**
 * One peak's geometry.
 *
 * *** KEYED OFF `direction`, NEVER `kind`. *** `Goal.kind` is presentation-only
 * by its own column comment; choosing a scale by it would let a user move a goal
 * onto the other scale by relabelling it, which is §5's honesty rule restated in
 * geometry.
 */
export function peakGeometry(peak: PeakInput, ceilings: Ceilings = PROPOSED_CEILINGS): PeakGeometry {
  const unmeasuredResult: PeakGeometry = {
    height: 0, magnitude: null, unmeasured: true, scale: peak.direction,
  };

  // No usable exchange rate → unmeasured, not guessed. Checked before anything
  // else, because every figure below would otherwise be in the wrong units.
  if (peak.convertible === false) return unmeasuredResult;

  if (peak.direction === 'paydown') {
    const cost = monthlyInterestCost(peak.accounts);
    if (cost === null) return unmeasuredResult;      // no rate stated anywhere
    return {
      height: scaleHeight(cost, ceilings.costCeiling, ceilings.maxHeight),
      magnitude: cost,
      unmeasured: false,
      scale: 'paydown',
    };
  }

  // *** AN ACCUMULATE PEAK IS NEVER UNMEASURED. *** `target_amount` is NOT NULL
  // on the server, so distance-remaining is always computable. Only debt peaks
  // can be grey, and only for a missing APR.
  const target = peak.targetAmount ?? null;
  if (target === null) return unmeasuredResult;      // defensive: an older payload

  const remaining = Math.max(0, target - (peak.currentAmount ?? 0));
  return {
    height: scaleHeight(remaining, ceilings.buildCeiling, ceilings.maxHeight),
    magnitude: remaining,
    unmeasured: false,
    scale: 'accumulate',
  };
}

export interface GroundInput {
  /** Active recurring expenses, already normalised to a MONTHLY amount in base currency. */
  recurringMonthly?: number[];
  /** `min_payment` on each debt account that states one. */
  cardMinimums?: Array<number | null | undefined>;
}

/**
 * The ground the peaks stand on.
 *
 * *** A MORTGAGE PAYMENT IS NOT A MOUNTAIN. *** Owner decision 2026-09-10,
 * correcting a category error rather than an ordering bug. The range shows
 * GOALS — things you climb toward, that finish. Rent never finishes and is not
 * optional, and ranking it against "pay off the Visa" compares a floor to a
 * summit. (A mortgage PAYOFF goal is still a peak; it is the monthly PAYMENT
 * that is ground.)
 *
 * *** THE GROUND IS "WHAT RECURS", NOT "WHAT IS ESSENTIAL". *** finPal genuinely
 * knows the first and does not know the second, which varies enormously between
 * households — a car is discretionary until it is how someone gets to work.
 * There is no needs/wants flag and this does not add one. **Do not infer need
 * from a category name**; the seeded `Housing → Rent/Mortgage` label is a string
 * a user can rename, not a fact.
 *
 * This is what makes voice rule 11 structural instead of a paragraph: the layout
 * says you stand on the ground before you climb, so a month with nothing spare
 * reads as *the ground being expensive* rather than as a failure to climb.
 */
export function groundHeight(input: GroundInput): number {
  const recurring = (input.recurringMonthly ?? []).reduce(
    (sum, amount) => sum + Math.max(0, amount || 0), 0);
  const minimums = (input.cardMinimums ?? []).reduce<number>(
    (sum, amount) => sum + Math.max(0, amount ?? 0), 0);
  return recurring + minimums;
}

/**
 * Split peaks onto their two scales, preserving order within each.
 *
 * Returned as two lists rather than one sorted list **so a caller cannot
 * accidentally render them against a shared axis.** The separation is the
 * design decision; making it awkward to undo is the point.
 */
export function splitByScale<T extends { direction: PeakDirection }>(peaks: T[]) {
  return {
    costingYou: peaks.filter((p) => p.direction === 'paydown'),
    building: peaks.filter((p) => p.direction === 'accumulate'),
  };
}
