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
