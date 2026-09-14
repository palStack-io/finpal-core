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
  // *** `strip.total` IS GONE FROM THE WIRE (decision 5). *** This card
  // rendered `4 of 4 · nothing more here`; the FRACTION went and the honest
  // empty states stayed. "no lesson here yet" is not a report card — it is the
  // truth about a goal nothing hangs off, and a blank strip would say it worse.
  if (!strip.has_lessons && strip.gear.length === 0) return null;

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
            <GearIcon slug={g.slug ?? g.milestone_slug} size={24} />
          </span>
        ))}
      </span>
      <span>
        {strip.next ? (
          <>
            next at{' '}
            {strip.next.unlock_at_progress !== null
              ? `${Math.round(strip.next.unlock_at_progress * 100)}%: `
              : ''}
            <strong style={{ color: 'var(--text-primary)' }}>{strip.next.title}</strong>
          </>
        ) : (
          /* *** "nothing more here" IS GONE, AND REMOVING THE COUNT IS WHAT
             EXPOSED IT. *** With `4 of 4` in front of it the phrase had
             context; alone beside four SOLID earned icons it reads as "this is
             empty" while the gear plainly says otherwise. The icons are the
             statement, so nothing is said.

             `no lesson here yet` STAYS: a goal nothing hangs off has no gear to
             speak for it, and a blank strip would say that worse. */
          strip.read === 0 ? 'no lesson here yet' : null
        )}
      </span>
    </div>
  );
};

export default GoalStrip;
