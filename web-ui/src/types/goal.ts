/**
 * Goal payload types.
 *
 * *** TYPED FROM THE SERVER'S ACTUAL RESPONSE, NOT FROM THE MODEL. ***
 * These keys were read off a running app on 2026-09-09 (`GET /api/v1/goals` on a
 * linked payoff goal), because an interface is a claim about a server, not a check
 * of one. `mobile/src/services/analyticsService.ts` got this wrong five times --
 * `net_worth` for `netWorth`, an invented `{success, health}` envelope, `net` for
 * `savings` -- and TypeScript cannot catch any of them, because the interface is
 * the thing that is wrong. A green typecheck is actively reassuring while it
 * happens.
 *
 * The captured body, verbatim:
 *
 *   {
 *     "id": 1, "user_id": "dump@test.com", "name": "Pay off Chase Amazon",
 *     "kind": "payoff", "scope": "household", "account_id": 1,
 *     "account_name": "Chase Amazon", "target_amount": 0.0,
 *     "start_amount": -1125.41, "current_manual": null, "currency_code": "USD",
 *     "start_date": "2026-09-09", "target_date": "2027-06-30",
 *     "status": "active", "achieved_at": null, "current_amount": -450.0,
 *     "direction": "paydown", "progress": 0.6001457246692317
 *   }
 */

export type GoalKind = 'payoff' | 'savings' | 'custom';
export type GoalScope = 'personal' | 'household';
export type GoalStatus = 'active' | 'achieved' | 'archived';

/**
 * Re-exported from the shared presentation helper, which owns the shape because
 * it is byte-identical in mobile and must stay importable there without a
 * `types/` folder. See `utils/goalTracking.ts`.
 */
export type { GoalAccountLink } from '../utils/goalTracking';
import type { GoalAccountLink } from '../utils/goalTracking';
export type GoalDirection = 'accumulate' | 'paydown';

/** The two scales a goal can be measured on. They are NEVER compared. */
export type PeakScale = 'cost' | 'build';

export interface PeakMountain {
  slug: string;
  name: string;
  elevation_m: number;
  /** *** A DRAFT, AND A FACT IN A PRODUCT IS A CLAIM. *** Owner-unchecked. */
  fact: string | null;
  summit_note: string | null;
}

/**
 * C1c. The mountain a goal is, decided by the SERVER.
 *
 * *** THREE NULL-ISH STATES, ALL DIFFERENT, AND COLLAPSING ANY TWO IS THE BUG. ***
 *
 *   `Goal.peak` UNDEFINED   the backend predates mountains. Render the OLD card:
 *                           no ridge, no mountain furniture, nothing.
 *   `unmeasured: true`      nothing states a rate. Render the flat ridge, which
 *                           is deliberately NOT a mountain, and say so.
 *   `magnitude: 0`          MEASURED, and the answer is zero -- a 0% balance
 *                           transfer. Render the smallest real mountain.
 *
 * "We do not know your rate" and "this is small" must never look alike, and
 * neither must "this client is older than the feature".
 */
export interface GoalPeak {
  scale: PeakScale;
  /** Monthly interest for `cost`, distance remaining for `build`. */
  magnitude: number | null;
  unmeasured: boolean;
  /** 0 (Table Mountain) .. 5 (Everest). `null` when unmeasured. */
  band: number | null;
  mountain: PeakMountain | null;
  /**
   * *** THE WATERMARK, AND THE SUMMIT NOTE READS FROM THIS ONE. *** `band` is
   * recomputed from the goal's CURRENT figure, so the mountain SHRINKS as the
   * user succeeds and finishing lands on the smallest one. Use `band` to draw
   * the peak and `hardest_band` to say what they beat.
   */
  hardest_band: number | null;
  hardest_mountain: PeakMountain | null;
  /**
   * Only ever set for a goal with exactly ONE account behind it. `null`
   * otherwise, on purpose: printing one rate under a goal spanning three cards
   * at three rates states something true of none of it -- `account_name`'s
   * "3 accounts" rule, applied to a number that is worse to get wrong.
   */
  apr: number | null;
}

export interface Goal {
  id: number;
  user_id: string;
  name: string;
  kind: GoalKind;
  scope: GoalScope;
  /**
   * The PRIMARY link, maintained by the server, and never null for a linked
   * goal. Kept beside `accounts` while both clients migrate; it is NOT the
   * whole answer for a goal that spans several accounts.
   */
  account_id: number | null;
  /**
   * *** DESCRIBES THE SET, NOT THE PRIMARY: "2 accounts" for a goal spanning
   * two. *** It exists for a client that cannot read `accounts` — naming one
   * card out of three would be false. Prefer `goalTrackingLabel`, which names
   * them when it can and falls back to this when it cannot.
   */
  account_name: string | null;
  /**
   * B12. *** OPTIONAL BECAUSE A NEW BUNDLE REACHES AN OLDER BACKEND: *** nginx
   * serves new assets before the backend restarts, and a self-hoster can update
   * `web-ui` alone. Read it through `goalTrackingLabel` / `canUnlinkAccounts`
   * rather than mapping it directly.
   */
  accounts?: GoalAccountLink[];
  /**
   * C1c. *** OPTIONAL BECAUSE A NEW BUNDLE REACHES AN OLDER BACKEND *** -- nginx
   * serves new assets before the backend restarts, a self-hoster can update
   * `web-ui` alone, and an installed mobile build is never redeployed with the
   * server. ABSENT must render the pre-mountain card, not the ridge.
   */
  peak?: GoalPeak;
  target_amount: number;
  /**
   * Snapshotted by the SERVER when the goal was created and never recomputed.
   * Sending it for a linked goal is ignored, deliberately.
   */
  start_amount: number;
  current_manual: number | null;
  currency_code: string;
  start_date: string;
  target_date: string | null;
  status: GoalStatus;
  achieved_at: string | null;

  /**
   * *** COMPUTED SERVER-SIDE. DO NOT DERIVE THESE IN THE CLIENT. ***
   * `progress` is `(current - start) / (target - start)`, unclamped, so it can
   * exceed 1. Two clients deriving one percentage is how web-ui and mobile spent
   * months disagreeing about the same figure.
   */
  current_amount: number;
  direction: GoalDirection;
  progress: number;
}

export interface GoalContribution {
  user_id: string;
  /** Never null -- the server falls back to the id's local part (D-154). */
  display_name: string;
  amount: number;
  /**
   * The row was CSV-imported or SimpleFin-synced, so `paid_by` credits whoever
   * imported it rather than whoever paid. *** MUST BE SHOWN. *** Rendering the
   * amount without this tells one partner they contributed money the other paid.
   */
  imported: boolean;
}

export interface CreateGoalData {
  name: string;
  kind?: GoalKind;
  scope?: GoalScope;
  /** Single-account create. Kept for callers that have not migrated. */
  account_id?: number | null;
  /**
   * B12. Sent INSTEAD of `account_id`; the server prefers this when both are
   * present, and an EMPTY list means a manual goal rather than "fall back to
   * the singular". Every account must be on the same side of zero — the server
   * refuses a card-plus-savings set and its message names both sides.
   */
  account_ids?: number[];
  target_amount: number;
  /** Manual goals only; ignored for a linked goal. */
  start_amount?: number;
  current_manual?: number;
  currency_code?: string;
  start_date?: string;
  target_date?: string | null;
}

/**
 * `start_amount` and `account_id` are absent on purpose: the server refuses to
 * move either, because both rewrite the denominator of a percentage the user has
 * already been shown. `status` accepts only 'archived' -- 'achieved' is stamped by
 * the server and a client that could write it could award itself a badge.
 */
export interface UpdateGoalData {
  name?: string;
  kind?: GoalKind;
  scope?: GoalScope;
  target_amount?: number;
  current_manual?: number;
  start_date?: string;
  target_date?: string | null;
  status?: 'active' | 'archived';
}
