/**
 * learnPal's range payload — `GET /api/v1/learnpal/range`.
 *
 * *** ONE REQUEST SERVES FOUR SURFACES: *** the range screen, the "Your range"
 * banner on the goals page, the per-goal strip on each card, and the gear kit.
 * They need the same joins, so splitting them would have the goals page issue
 * three requests to draw one screen.
 *
 * *** EVERY PATH HERE 404s WHEN THE MODULE IS OFF, AND THAT IS NOT AN ERROR. ***
 * The namespace is only registered through the backend manifest, so a 404 means
 * "learnPal is not installed" and the client must render NOTHING — the same
 * discipline as `peak` being absent from a goal payload.
 */

import type { GoalPeak, PeakScale } from './goal';

export interface RangeGear {
  /** May be null: a milestone can exist without art yet. */
  slug: string | null;
  milestone_slug: string;
  title: string;
  earned: boolean;
}

export interface RangeNext {
  slug: string;
  title: string;
  /** 0..1. The threshold, compared against the goal's WATERMARK. */
  unlock_at_progress: number | null;
  gear_slug: string | null;
}

export interface RangeStrip {
  read: number;
  /**
   * *** ALTITUDE MILESTONES ONLY, WHICH IS THE HONEST DENOMINATOR. *** A
   * predicate-gated lesson ("20 categorised transactions") has no goal behind
   * it, so counting it here would print "3 of 8" on a card where five can never
   * be opened by it.
   */
  total: number;
  /** `null` when there is nothing ahead — every gate is cleared or recorded. */
  next: RangeNext | null;
  gear: RangeGear[];
}

export interface RangePeak {
  goal_id: number;
  name: string;
  currency_code: string;
  /** The SERVER's percentage, the same function the goal card renders. */
  progress: number;
  status: string;
  peak: GoalPeak;
  strip: RangeStrip;
}

export interface RangeScaleSide {
  heading: string;
  /** Printed beside the total, because the two scales share no unit. */
  unit: string;
  total: number;
  peaks: RangePeak[];
}

export interface RangeGround {
  total: number;
  recurring: number;
  minimums: number;
}

export interface LearnRange {
  cost: RangeScaleSide;
  build: RangeScaleSide;
  ground: RangeGround;
  /** Across the whole user — includes the predicate lessons a strip excludes. */
  lessons: { read: number; total: number };
  kit: RangeGear[];
}

export interface LessonRow {
  slug: string;
  title: string;
  gear_slug: string | null;
  surface: string;
  applies_to_direction: string | null;
  unlock_at_progress: number | null;
  earned: boolean;
  /**
   * Whether there is prose to open. Eleven approved lessons are not seeded and
   * four are deliberately unwritten, so "no body" is a real, expected state and
   * not a bug to hide.
   */
  has_body: boolean;
}

export interface LessonDetail {
  slug: string;
  title: string;
  gear_slug: string | null;
  surface: string;
  earned: boolean;
  /** `null` while locked. A locked lesson answers 200, never 403. */
  body_md: string | null;
  locked: boolean;
}

export type { PeakScale };

/**
 * `GET /api/v1/learnpal/stats` — the learnPal HOME.
 *
 * *** ITS OWN ENDPOINT, NOT MORE KEYS ON `/range`. *** The range payload serves
 * four surfaces including the strip on every goal card; home-only fields would
 * make all four carry them.
 *
 * *** THERE IS NO POINTS FIELD AND THAT IS A DECISION. *** Owner, 2026-09-11:
 * learnPal has no points at all — no ledger, no column. Points are meant to
 * come from ANSWERING and no quiz exists, so a points tile would read 0 for
 * ever with no way to move it. A backend test pins the absence.
 */

export interface StatsMountain {
  slug: string;
  name: string;
  elevation_m: number;
  /** Seeded content a human approved. Never generated. */
  fact: string | null;
  summit_note: string | null;
}

export interface StatsHighest {
  /** Index into the band ladder, 0-based. */
  band: number;
  band_total: number;
  mountain: StatsMountain | null;
  goal_id: number;
  goal_name: string;
  /**
   * *** "EVER" INCLUDES AN ARCHIVED OR ACHIEVED GOAL, UNLIKE THE RANGE. *** So
   * the client can say "on a goal you have since finished" rather than implying
   * the climb is still under way.
   */
  goal_status: string;
}

export interface StatsRecent {
  slug: string;
  title: string;
  gear_slug: string | null;
  /** False for the eleven unseeded drafts and the four unwritten lessons. */
  has_body: boolean;
  verified_by: string;
  /** ISO 8601, or null on a row written before the column had a default. */
  unlocked_at: string | null;
  /**
   * *** NULL IS A REAL STATE, TWICE OVER. *** A predicate-gated lesson has no
   * goal behind it, and the FK is `ondelete='SET NULL'` so a deleted goal keeps
   * the unlock and loses the attribution. Render "unlocked", never "by None".
   */
  goal_id: number | null;
  goal_name: string | null;
}

export interface StatsNext {
  slug: string;
  title: string;
  gear_slug: string | null;
  surface: string;
  has_body: boolean;
  unlock_at_progress: number | null;
  applies_to_direction: string | null;
  /** Which kind of gate holds it shut. `null` = neither; guided setup owns it. */
  gate: 'altitude' | 'check' | 'setup' | null;
  /**
   * Why it is locked, DERIVED from the gate — a threshold for an altitude gate,
   * `checks.check_reason` for a predicate. `null` when the server cannot say,
   * which is fail-closed and honest rather than a plausible sentence about a
   * condition nothing tests.
   */
  reason: string | null;
  goal_id: number | null;
  goal_name: string | null;
  goal_progress: number | null;
}

export interface LearnStats {
  lessons: {
    read: number;
    total: number;
    /** How many have no prose yet. A reader must not be offered for those. */
    without_body: number;
  };
  gear: { earned: number; total: number };
  /** `null` when no goal has a band — not band zero. */
  highest: StatsHighest | null;
  recent: StatsRecent[];
  next: StatsNext[];
}
