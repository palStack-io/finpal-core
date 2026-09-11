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
