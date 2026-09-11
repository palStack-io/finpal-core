import React from 'react';
import { GearIcon } from '../../components/GearIcon';
import type { RangeStrip } from '../../types/learnpal';

/**
 * The learnPal strip on a goal card — layout A.
 *
 * *** learnPal ONLY: with the module off there is no strip, no border, nothing.
 * *** The card above it keeps its mountain, which is core.
 *
 * *** THE DENOMINATOR IS ALTITUDE LESSONS FOR THIS GOAL'S DIRECTION, NOT EVERY
 * LESSON. *** The server decides that; a predicate-gated lesson has no goal
 * behind it, so "3 of 8" on a card where five can never be opened by it would
 * be false.
 */
export const GoalStrip: React.FC<{ strip: RangeStrip; goalId: number }> = ({ strip, goalId }) => {
  // Nothing applies to this goal at all -- render nothing rather than "0 of 0".
  if (strip.total === 0 && strip.gear.length === 0) return null;

  return (
    <div
      data-testid={`goal-strip-${goalId}`}
      style={{
        marginTop: 13, paddingTop: 11,
        borderTop: '1px solid var(--border-light)',
        display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap',
        fontSize: 12.5, color: 'var(--text-secondary)',
      }}
    >
      <span style={{ display: 'flex', gap: 4 }}>
        {strip.gear.map((g) => (
          <span
            key={g.milestone_slug}
            title={`${g.title}${g.earned ? '' : ' — not yet'}`}
            /* Earned solid, locked at 30%. The locked ones are SHOWN rather than
               omitted: the row is what the user is working towards, and a strip
               that grew an icon at a time would never show the shape of it. */
            style={{ opacity: g.earned ? 1 : 0.3, lineHeight: 0 }}
          >
            <GearIcon slug={g.slug ?? g.milestone_slug} size={18} />
          </span>
        ))}
      </span>
      <span>
        {strip.total > 0 && `${strip.read} of ${strip.total}`}
        {strip.next ? (
          <>
            {strip.total > 0 ? ' · ' : ''}
            next at{' '}
            {strip.next.unlock_at_progress !== null
              ? `${Math.round(strip.next.unlock_at_progress * 100)}%: `
              : ''}
            <strong style={{ color: 'var(--text-primary)' }}>{strip.next.title}</strong>
          </>
        ) : (
          // An honest empty state, not a blank strip.
          strip.read === 0
            ? ' · no lesson here yet'
            : ' · nothing more here'
        )}
      </span>
    </div>
  );
};

export default GoalStrip;
