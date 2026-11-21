/**
 * A goal's mountain, read the one way every screen reads it (Harun, 2026-11-20, binding): the mountain is SIZED BY
 * THE GOAL (the server's `peak.size`: a saving goal's target, a debt's amount to clear) and HOW FAR UP is the goal's
 * `progress` (the server's). Everest's climber is the only thing drawn from acts.
 */
import { heightForMagnitude } from './mountainGeometry';
import type { Goal, GoalPeak } from '../types/goal';

/** Drawn height (0..1) of a goal's peak: its size on the money ladder. An older backend without `size` falls back
 *  to the figure it did send. */
export const goalPeakHeight = (peak: GoalPeak): number =>
  peak.size !== undefined && peak.size !== null
    ? heightForMagnitude(peak.size, 'build')
    : heightForMagnitude(peak.magnitude, peak.scale);

/** How far up (0..1), from the server's `progress`; clamped for drawing only. */
export const goalProgress = (goal: Pick<Goal, 'progress'>): number =>
  Math.max(0, Math.min(1, Number.isFinite(goal.progress) ? goal.progress : 0));

/** Finished: the server's progress reached 1. Never read from a magnitude, and a goal with no size is never
 *  "finished" (we do not know what it is). */
export const goalFinished = (goal: Pick<Goal, 'progress' | 'peak'>): boolean =>
  !goal.peak?.unmeasured && Number.isFinite(goal.progress) && goal.progress >= 1;
