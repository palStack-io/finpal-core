/**
 * The words beside a goal's mountain.
 *
 * Pure and structural, like `goalFigures` and `goalTracking`: each client passes
 * its own `Goal`, so this file imports no types and can be duplicated into
 * mobile byte-for-byte rather than merely equivalently.
 *
 * *** THE EYEBROW AND THE COLOUR CARRY THE NEVER-COMPARE RULE SO NO CAPTION HAS
 * TO. *** `cost` is monthly interest and `build` is distance remaining; they
 * share no unit, so a caption saying "do not compare these" would be an
 * instruction where a colour and two different words are a fact.
 */

export type PeakScale = 'cost' | 'build';

export interface PeakLike {
  scale: PeakScale;
  magnitude: number | null;
  unmeasured: boolean;
  band: number | null;
  mountain: { name: string; elevation_m: number; summit_note: string | null } | null;
  hardest_band: number | null;
  hardest_mountain: { name: string; summit_note: string | null } | null;
  apr: number | null;
  projection?: {
    never: boolean; months?: number; monthly_interest?: number; payment: number;
  } | null;
}

/** A money formatter, so this module never decides a currency or a locale. */
export type MoneyFormatter = (amount: number) => string;

export const peakColorVar = (peak: PeakLike): string =>
  peak.unmeasured ? 'var(--peak-unmeasured)'
    : peak.scale === 'cost' ? 'var(--peak-cost)' : 'var(--peak-build)';

export const peakEyebrow = (peak: PeakLike): string =>
  peak.scale === 'cost' ? "What's costing you" : "What you're building";

/**
 * `1,345 m` — grouped, because four digits of metres read as a year otherwise.
 *
 * *** EXPORTED BECAUSE THE RANGE CARD WAS FORMATTING IT ITSELF. ***
 * `GoalRange.tsx` hand-built `name · N m` with a bare `toLocaleString()`, so one
 * elevation was grouped by the browser's locale on the dashboard and by `en-GB`
 * on the goals page. Two formatters for one figure is D-101's shape.
 */
export const peakElevation = (metres: number): string =>
  `${metres.toLocaleString('en-GB')} m`;

/**
 * `debt` or `saving` — the word that says which scale a peak is on.
 *
 * *** THE COLOUR WAS CARRYING THIS ALONE, AND A COLOUR ALONE CANNOT (FINPAL-26).
 * *** `peakColorVar` states the never-compare rule, which is right, but on the
 * range card it left a reader with red peaks and green peaks and nothing saying
 * which was which: unreadable to anyone who does not separate those two hues,
 * and a guess for everyone else.
 *
 * *** IT READS `scale`, WHICH IS NEVER UNKNOWN. *** `unmeasured` is about the
 * MAGNITUDE — no account states a rate — while the scale comes from the goal's
 * direction, so an unmeasured peak is still definitely debt. There is no third
 * word here because there is no third state for one to name.
 *
 * Deliberately not `peakEyebrow`'s wording: that is a heading over a card, this
 * is one word inside an 11px caption between two middots. One distinction, two
 * registers, and the register is the whole reason both exist.
 */
export const peakKindLabel = (peak: PeakLike): string =>
  peak.scale === 'cost' ? 'debt' : 'saving';

/**
 * What the "Your range" card says under its title.
 *
 * *** ONE STRING, THREE SURFACES. *** The dashboard card, learnPal's Range page
 * and mobile's `YourRange` draw the same thing; the copy lived at each of them
 * and had already drifted into two different sentences. Owner-approved wording,
 * 2026-09-18 (FINPAL-26): the old line said what the picture was, this one says
 * why a reader should care that it is slow.
 */
export const RANGE_BLURB =
  "Reaching financial goals can be a slow and steady climb: here's where you "
  + 'stand in your journey to building savings and decreasing debt.';

/** The same, for a user with no goals — there is no standing to report yet. */
export const RANGE_BLURB_EMPTY =
  'Reaching financial goals can be a slow and steady climb: name a goal and '
  + 'this is where you will see how far up it you are.';

/**
 * `Ben Nevis · 1,345 m · £13.33 a month in interest · 19.99% APR`
 *
 * *** THE UNMEASURED CASE IS NOT A SHORTER VERSION OF THIS SENTENCE. *** It gets
 * its own line, in italics, that says what to do about it — "we do not know your
 * rate" and "this is small" must never look alike, and a subline reading
 * "Table Mountain · £0.00 a month" would be the second thing dressed as nothing
 * at all. Callers must branch on `unmeasured` before calling this.
 */
export const peakSubline = (peak: PeakLike, money: MoneyFormatter): string => {
  const parts: string[] = [];
  if (peak.mountain) {
    parts.push(peak.mountain.name, peakElevation(peak.mountain.elevation_m));
  }
  if (peak.magnitude !== null) {
    parts.push(peak.scale === 'cost'
      ? `${money(peak.magnitude)} a month in interest`
      : `${money(peak.magnitude)} still to save`);
  }
  // Only ever present for a one-account goal; the server refuses to pick one
  // rate out of three, so there is nothing to guard against here.
  if (peak.apr !== null) parts.push(`${peak.apr}% APR`);
  return parts.join(' · ');
};

/** The prompt that replaces the subline when nothing states a rate. */
export const UNMEASURED_SUBLINE =
  'No rate recorded — add an APR to see what this costs you';

/**
 * What a finished goal says.
 *
 * *** IT READS THE WATERMARK, NEVER THE CURRENT BAND. *** The band is recomputed
 * from the goal's current figure, so the mountain SHRINKS as the user succeeds
 * and a cleared goal sits on the smallest one. Reading `mountain` here would
 * congratulate somebody on Table Mountain for clearing an Aconcagua — the whole
 * reason `hardest_band` is stored.
 *
 * Returns `null` when there is no watermark, which is a goal that was cleared
 * before watermarking existed or never had a measurable figure. Silence is
 * correct there; inventing a mountain to congratulate them on is not.
 */
export const peakSummitLine = (peak: PeakLike): string | null => {
  const hardest = peak.hardest_mountain;
  if (!hardest) return null;
  return hardest.summit_note
    ?? `You started at ${hardest.name}. That's finished.`;
};

/** `Hardest it ever got: Aconcagua`, or `null` when there is no watermark. */
export const peakHardestLine = (peak: PeakLike): string | null =>
  peak.hardest_mountain ? `Hardest it ever got: ${peak.hardest_mountain.name}` : null;

/** `1 year and 9 months`. Grouped — 21 months reads as nothing. */
const spanWords = (months: number): string => {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = `${years} year${years > 1 ? 's' : ''}`;
  const m = `${rest} month${rest > 1 ? 's' : ''}`;
  if (years && rest) return `${y} and ${m}`;
  return years ? y : m;
};

/**
 * How long this debt takes to clear, or what stops it clearing.
 *
 * *** THE SERVER DOES THE ARITHMETIC; THIS ONLY CHOOSES WORDS. *** Two clients
 * computing a payoff date from an APR is two chances to disagree with each
 * other and with the coins engine, which prints the same figure — the whole
 * reason the maths moved into one module (D-101).
 *
 * *** "NEVER" IS NOT A FAILURE TO ANSWER. *** A minimum that does not exceed
 * the interest means the balance never falls, and saying so plainly is far
 * more use than a number. Voice rule 11: it names the product, not the person.
 */
export const peakPayoffLine = (
  peak: PeakLike, money: MoneyFormatter,
): string | null => {
  const p = peak.projection;
  if (!p) return null;
  if (p.never) {
    const interest = p.monthly_interest != null ? money(p.monthly_interest) : null;
    return interest
      ? `At ${money(p.payment)} a month this never clears — the interest alone `
        + `is ${interest}. That is the product, not you.`
      : `At ${money(p.payment)} a month this never clears.`;
  }
  if (p.months == null) return null;
  return `${spanWords(p.months)} to clear, paying ${money(p.payment)} a month`;
};
