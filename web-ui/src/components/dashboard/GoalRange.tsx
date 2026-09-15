import React from 'react';

import { MountainSilhouette } from '../MountainSilhouette';
import { heightForMagnitude } from '../../utils/mountainGeometry';
import { formatMoney } from '../../styles/money';
import type { Goal } from '../../types/goal';

/**
 * Every goal, drawn as one range.
 *
 * *** THE RANGE IS THE DASHBOARD — spec variant B. *** The page used to open
 * with four stat cards, which is the same opening as every other money app. A
 * user's goals are the one thing on it that is theirs, so they earn the top and
 * the totals sit underneath rather than above.
 *
 * *** IT REUSES `MountainSilhouette` RATHER THAN DRAWING ITS OWN PEAKS. ***
 * Goals already draws one peak per card from `goal.peak`, and a second
 * implementation of the same shape is how two pictures of one fact drift apart
 * — the failure this codebase has paid for more than once. What is new here is
 * only the ARRANGEMENT: a shared baseline, a reading order, and a label per
 * peak.
 *
 * *** NO DENOMINATOR, DELIBERATELY. *** No "2 of 4 goals", no percentage
 * complete across the range. Decision 5 allows exactly one denominator — a
 * target the user chose themselves — and "how many goals have you finished" is
 * not one of those. Each peak states its own remaining figure, which is the
 * user's own target and therefore honest.
 */

/** Peaks read tallest-first, so the eye lands on the biggest climb. */
const byHeightDescending = (a: RangePeak, b: RangePeak) => b.height - a.height;

interface RangePeak {
  goal: Goal;
  height: number;
  /** A build goal at zero magnitude is finished; a cost goal at zero costs nothing. */
  finished: boolean;
}

export interface GoalRangeProps {
  goals: Goal[];
  currency: string;
  /** Pixels the tallest peak occupies. Everything scales from it. */
  maxPixelHeight?: number;
}

/**
 * What is left to do on this goal, in the goal's own terms.
 *
 * A saving goal states what is still to save. A payoff goal states what the
 * debt costs per month, because that is the figure that makes it urgent — the
 * balance alone says nothing about whether it is worth paying first.
 */
const remainingLabel = (goal: Goal, currency: string): string => {
  const peak = goal.peak;
  if (!peak) return '';
  if (peak.scale === 'cost') {
    return peak.magnitude > 0
      ? `${formatMoney(peak.magnitude, { currency })} a month in interest`
      : 'Nothing owed';
  }
  const left = Math.max(0, (goal.target_amount ?? 0) - (goal.current_amount ?? 0));
  return left > 0 ? `${formatMoney(left, { currency })} still to save` : 'Finished';
};

export const GoalRange: React.FC<GoalRangeProps> = ({
  goals,
  currency,
  maxPixelHeight = 140,
}) => {
  /*
   * *** A GOAL WITHOUT A PEAK IS SKIPPED, NOT DRAWN FLAT. *** `peak` is
   * undefined when the backend predates mountains, and inventing a shape for it
   * would be drawing a fact finPal does not have. The Goals page makes the same
   * choice for the same reason.
   */
  const peaks: RangePeak[] = goals
    .filter((goal) => goal.peak !== undefined)
    .map((goal) => ({
      goal,
      height: heightForMagnitude(goal.peak!.magnitude, goal.peak!.scale),
      finished: (goal.peak!.magnitude ?? 0) <= 0,
    }))
    .sort(byHeightDescending);

  // Nothing to draw is not an empty frame: the caller decides what to show
  // instead, because "you have no goals yet" belongs to base camp, not here.
  if (peaks.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: '28px',
        padding: '20px 24px 0',
        minHeight: `${maxPixelHeight + 60}px`,
        overflowX: 'auto',
      }}
    >
      {peaks.map(({ goal, height, finished }) => (
        <div
          key={goal.id}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '128px' }}
        >
          {/* The label sits ABOVE its own peak rather than in a shared legend:
              a legend makes the reader match colours, and these peaks differ by
              shape and height, not by colour. */}
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {goal.name}{finished ? ' ✓' : ''}
            </div>
            <div className="fp-hint" style={{ fontSize: '11.5px' }}>
              {goal.peak?.mountain?.name}
              {goal.peak?.mountain?.elevation_m
                ? ` · ${goal.peak.mountain.elevation_m.toLocaleString()} m`
                : ''}
            </div>
            <div className="fp-hint" style={{ fontSize: '11.5px' }}>
              {remainingLabel(goal, currency)}
            </div>
          </div>
          {/* `aria-hidden` through `decorative`: every figure the picture
              carries is written above it in text, so a screen reader loses
              nothing by skipping the art. */}
          <MountainSilhouette
            band={goal.peak!.band}
            height={height}
            scale={goal.peak!.scale}
            unmeasured={goal.peak!.unmeasured}
            maxPixelHeight={maxPixelHeight}
            decorative
          />
        </div>
      ))}
    </div>
  );
};

export default GoalRange;
