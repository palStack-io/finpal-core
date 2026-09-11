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
}

/** A money formatter, so this module never decides a currency or a locale. */
export type MoneyFormatter = (amount: number) => string;

export const peakColorVar = (peak: PeakLike): string =>
  peak.unmeasured ? 'var(--peak-unmeasured)'
    : peak.scale === 'cost' ? 'var(--peak-cost)' : 'var(--peak-build)';

export const peakEyebrow = (peak: PeakLike): string =>
  peak.scale === 'cost' ? "What's costing you" : "What you're building";

/** `1,345 m` — grouped, because four digits of metres read as a year otherwise. */
const elevation = (metres: number): string =>
  `${metres.toLocaleString('en-GB')} m`;

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
    parts.push(peak.mountain.name, elevation(peak.mountain.elevation_m));
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
