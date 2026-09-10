/**
 * The line under a goal's name that says which balances it is reading (B12).
 *
 * *** A GOAL CAN NOW SPAN SEVERAL ACCOUNTS, AND THE SERVER'S `account_name`
 * DEGRADES TO "3 accounts" BECAUSE IT HAS TO. *** That string exists for a client
 * that has NOT migrated: naming one card out of three would be false, and NULL
 * would render "Tracked by hand" for a goal watching three cards, which is
 * D-176's shape — a key a client already reads optimistically, switched on to a
 * wrong answer. A migrated client has the whole list in `accounts` and can do
 * better than a count, so this is where it does it.
 *
 * *** THE SAME FUNCTION EXISTS IN THE OTHER CLIENT AND THE TWO TEST FILES PIN THE
 * SAME CASE TABLE ON PURPOSE. *** web-ui and mobile are separate git repos with
 * no shared module, so there is nothing to import; what there can be is one table
 * of inputs and expected strings written identically in both, so a divergence
 * shows up as a diff rather than as a user noticing that the phone and the web
 * app describe one goal two different ways. `goalFigures.ts` next door
 * established that convention for D-179 and this is its second use. **Change one,
 * change both, in the same turn.** These two files are byte-identical; `diff`
 * them.
 *
 * *** `accounts` IS OPTIONAL AND THAT IS NOT DEFENSIVE PROGRAMMING. *** A new
 * bundle reaches an older backend all the time here — nginx serves the new assets
 * before the backend container restarts, and a self-hoster can update `web-ui`
 * alone. `goal.accounts.map(...)` would then throw on a page that worked a minute
 * earlier. The first rows of the case table are exactly that payload, and the
 * fallback is the server's own `account_name`, which is never wrong, only vaguer.
 *
 * *** NOTHING HERE DERIVES A FIGURE. *** `progress`, `direction` and
 * `current_amount` come from the server and a client must never work them out
 * (D-101). `start_amount` is carried per link so a client can SHOW what each
 * account contributed to the denominator, never so it can recompute one.
 */

/** One linked account, as the payload carries it. */
export interface GoalAccountLink {
  id: number;
  name: string;
  /**
   * Snapshotted by the SERVER when this account joined the goal, and never
   * recomputed. For display only — see the header.
   */
  start_amount: number;
}

/**
 * The shape these functions need. Structural on purpose: each client passes its
 * own `Goal`, which is a superset, so this file needs no import at all and the
 * two copies are byte-identical rather than merely equivalent.
 */
export interface TrackedGoal {
  account_id: number | null;
  account_name: string | null;
  /** ABSENT on a payload from a backend that predates B12. See the header. */
  accounts?: GoalAccountLink[];
}

/**
 * A goal with no account is tracked by hand, and the copy says so plainly: its
 * figure is typed rather than computed, so there is no contribution breakdown
 * and nothing stopping an inflated number.
 */
export const TRACKED_BY_HAND = 'Tracked by hand';

/**
 * Above this many, the names stop being readable on a phone row and a count says
 * more. Deliberately the same shape of phrase the SERVER falls back to, so the
 * two never read as different features.
 */
const MAX_NAMED = 3;

/** What accounts this goal actually reads, tolerating an older payload. */
const linkedNames = (goal: TrackedGoal): string[] => {
  if (goal.accounts && goal.accounts.length > 0) {
    // The server's order, not ours. It already chose one, and re-sorting here
    // would be a second definition of the same thing.
    return goal.accounts.map((account) => account.name);
  }
  // No list: either an older backend, or the window between `goal_accounts`
  // being created at boot and the backfill filling it. `account_name` is
  // populated in both, and `account_id` is what says this goal is LINKED — an
  // empty `accounts` on its own must never be read as "tracked by hand".
  if (goal.account_id !== null && goal.account_name) return [goal.account_name];
  return [];
};

/** The full sentence, ready to render. */
export function goalTrackingLabel(goal: TrackedGoal): string {
  const names = linkedNames(goal);
  if (names.length === 0) return TRACKED_BY_HAND;
  if (names.length > MAX_NAMED) return `Tracking ${names.length} accounts`;
  if (names.length === 1) return `Tracking ${names[0]}`;
  // "A, B & C" — the ampersand on the last pair only, which is how a person
  // writes a list and how the existing "Joint · Alex & Morgan" label reads.
  return `Tracking ${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/**
 * Whether a "remove this account" control should exist at all.
 *
 * *** THE SERVER ALWAYS REFUSES REMOVING THE LAST ACCOUNT, SO A CONTROL THAT
 * OFFERS IT CAN ONLY EVER FAIL. *** That is D-172's shape — an affordance that
 * lies — and `GoalForm`'s own header already cites it. Removing the last link is
 * a conversion to a manual goal, not an unlink; the goal gets archived instead.
 */
export const canUnlinkAccounts = (goal: TrackedGoal): boolean =>
  (goal.accounts?.length ?? 0) > 1;
