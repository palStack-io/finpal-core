/**
 * Parse a timestamp the way this API actually sends them.
 *
 * *** THE SERVER SENDS NAIVE UTC AND JAVASCRIPT GUESSES DIFFERENTLY DEPENDING
 * ON WHETHER THERE IS A TIME IN THE STRING. *** Both guesses are wrong here,
 * in opposite directions:
 *
 * | what the API sends              | `new Date()` treats it as | result west of UTC |
 * |---------------------------------|---------------------------|--------------------|
 * | `2026-01-15T22:15:39.768484`    | **local**                 | hours in the FUTURE |
 * | `2026-01-15`                     | **UTC**                   | the PREVIOUS day (D-206) |
 *
 * The columns are written in UTC (`datetime.utcnow()`) and serialised with no
 * offset, so neither default is right and the zone has to be stated explicitly.
 *
 * Measured on the live demo, 2026-09-15: `last_update` came back as
 * `2026-09-16T04:09:22.458182` while the local clock read `2026-09-15 22:09` —
 * so the naive reading renders a refresh that has not happened yet.
 *
 * *** AND THE DATE-ONLY CASE IS THE ONE THAT BITES SILENTLY. *** A
 * `purchase_date` of `2026-01-15T02:00:00` (UTC) is 15 January in UTC and
 * **14 January** in Denver. Read as local it stays the 15th, so the day is
 * wrong for every timestamp falling in the small hours UTC — roughly a quarter
 * of them in this timezone — and right for the rest, which is exactly why it
 * survived: the demo's own data sits at 22:15 UTC and renders correctly.
 */

/** Anything that already states a zone: `Z`, `+01:00`, `-0700`. */
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/;

/** A bare calendar day with no time at all. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A `Date`, or **null** when there is nothing parseable.
 *
 * Returns null rather than an `Invalid Date`, because an Invalid Date is truthy
 * and formats as the literal string "Invalid Date" on the page — a caller that
 * forgets to check prints that to the user, whereas null forces the decision.
 */
export function parseServerDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  let normalised: string;
  if (HAS_ZONE.test(value)) {
    // The server already said which zone. Believe it.
    normalised = value;
  } else if (DATE_ONLY.test(value)) {
    /* A bare day is a CALENDAR day, not an instant — "bought on the 15th" means
       the 15th wherever the reader is. Appending a local midnight keeps it on
       the 15th; appending `Z` would make it UTC midnight and render as the 14th
       west of UTC, which is D-206 exactly. */
    normalised = `${value}T00:00:00`;
  } else {
    // A naive date-TIME. The column is UTC, so say so.
    normalised = `${value}Z`;
  }

  const d = new Date(normalised);
  return Number.isNaN(d.getTime()) ? null : d;
}
