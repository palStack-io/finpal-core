import { parseServerDate } from './serverDate';

/**
 * The portfolio's three figures, and where its value sits.
 *
 * *** THE SERVER ALREADY SENDS EVERY ONE OF THESE, AND THE PAGE RECOMPUTED THEM. ***
 * `src/models/investment.py` exposes `cost_basis`, `current_value`, `gain_loss` and
 * `gain_loss_percentage` as `@property` — `shares * purchase_price` and
 * `shares * current_price`. `Investments.tsx` did the identical arithmetic in
 * TypeScript. Measured against the live demo the two agreed to the cent on both
 * holdings, so this is NOT a correction: it is one presentation computed in two
 * places, which is D-101's shape, and the server's copy is the canonical one
 * because mobile and every other consumer reads it.
 *
 * So this file does NOT re-derive a holding's value. It only ADDS UP what the
 * server sent, and refuses when it cannot.
 *
 * *** AND `current_value` IS AS OLD AS THE LAST PRICE REFRESH. *** It is
 * `shares * current_price`, and `current_price` is whatever the last refresh
 * wrote. Nothing here is live, the page says so next to the figure, and a
 * screen that hid that would be inviting a decision on a stale number.
 */

/** Only the fields the totals need. Declared narrowly so a caller cannot pass
 *  a half-built row and have it silently counted. */
export interface HoldingFigures {
  symbol: string;
  cost_basis: number;
  current_value: number;
  gain_loss: number;
}

export interface HoldingTotals {
  /** Sum of `current_value` over the readable holdings. */
  worthNow: number;
  /** Sum of `cost_basis`. */
  youPutIn: number;
  /** Sum of `gain_loss`. Kept separate rather than subtracted, so that a
   *  server whose own figures do not reconcile shows up instead of being
   *  papered over by arithmetic done here. */
  gain: number;
  /**
   * `gain / youPutIn` as a percentage, or **null** when nothing was put in.
   *
   * *** null, NOT 0. *** A portfolio you paid nothing for has no percentage
   * return — the figure is undefined, not zero — and 0% reads as "flat",
   * which is a different and false statement. The caller renders `—`.
   *
   * *** AND IT IS DERIVED FROM THE TOTALS, NEVER AVERAGED FROM THE ROWS. ***
   * On the live demo the two differ by nearly five points: from the totals it
   * is 63.58%, while the mean of the rows' own percentages is 59.10%. The mean
   * weights a $1,162 holding the same as a $2,621 one.
   */
  gainPercent: number | null;
  /** Symbols whose figures could not be read. Named on screen, never counted. */
  unreadable: string[];
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/**
 * Add up the holdings the server could describe, and name the ones it could not.
 *
 * A holding missing any of the three figures is excluded WHOLE and its symbol
 * returned in `unreadable` — never partly counted, and never back-filled from
 * `shares * current_price`, because a silently reconstructed figure is
 * indistinguishable on screen from one the server stands behind.
 */
export function holdingTotals(holdings: readonly Partial<HoldingFigures>[]): HoldingTotals {
  const out: HoldingTotals = {
    worthNow: 0, youPutIn: 0, gain: 0, gainPercent: null, unreadable: [],
  };

  for (const h of holdings) {
    if (!isFiniteNumber(h.current_value) || !isFiniteNumber(h.cost_basis)
      || !isFiniteNumber(h.gain_loss)) {
      // A row with no symbol either is still a row that did not count, so it
      // is reported rather than dropped — a total quietly missing a holding is
      // the failure this whole file exists to avoid.
      out.unreadable.push(h.symbol || 'an unnamed holding');
      continue;
    }
    out.worthNow += h.current_value;
    out.youPutIn += h.cost_basis;
    out.gain += h.gain_loss;
  }

  if (out.youPutIn > 0) out.gainPercent = (out.gain / out.youPutIn) * 100;
  return out;
}

export interface ValueSegment {
  symbol: string;
  /** Percentage of `worthNow`, 0-100. */
  share: number;
}

/**
 * Where the value sits, largest first.
 *
 * Returns `[]` rather than a divide-by-zero when nothing is worth anything,
 * and skips the same rows `holdingTotals` refuses — so the bar and the figures
 * above it are always describing the same set of holdings.
 */
export function valueSplit(holdings: readonly Partial<HoldingFigures>[]): ValueSegment[] {
  const readable = holdings.filter(
    (h) => isFiniteNumber(h.current_value) && isFiniteNumber(h.cost_basis)
      && isFiniteNumber(h.gain_loss));
  const total = readable.reduce((sum, h) => sum + (h.current_value as number), 0);
  if (total <= 0) return [];
  return readable
    .map((h) => ({
      symbol: h.symbol || '—',
      share: ((h.current_value as number) / total) * 100,
    }))
    .sort((a, b) => b.share - a.share);
}

/**
 * When the prices behind these figures were last written, or **null**.
 *
 * *** THE SERVER SENDS NAIVE UTC AND `new Date()` READS IT AS LOCAL. ***
 * `last_update` arrives as `"2026-09-16T04:09:22.458182"` — no `Z`, no offset —
 * and the column is written in UTC. A suffix-less date-TIME string is parsed by
 * ECMAScript as local time, so west of UTC this renders hours in the FUTURE:
 * measured here, 04:09 UTC displayed as "16 Sep, 04:09" when the correct local
 * reading is "15 Sep, 22:09". (Note the opposite trap for date-ONLY strings,
 * which are parsed as UTC and read as the previous day — that is D-206.) So the
 * `Z` is appended explicitly rather than trusting either default.
 *
 * Returns the LATEST update across the holdings, because that is the honest
 * answer to "how old is this total": the total is only as fresh as its
 * stalest input, but claiming the oldest would understate a portfolio whose
 * other rows just refreshed. The page says which it is.
 */
export function lastPriceUpdate(
  holdings: readonly { last_update?: string }[],
): Date | null {
  let newest: Date | null = null;
  for (const h of holdings) {
    // Parsed by `parseServerDate`, not here: the naive-UTC rule is one rule and
    // two copies of it would be two things to keep right (D-101). That file
    // carries the measurements and the date-only counter-case.
    const d = parseServerDate(h.last_update);
    if (d === null) continue;
    if (newest === null || d > newest) newest = d;
  }
  return newest;
}
