import React, { useState } from 'react';
import { formatMoney } from '../../styles/money';
import type { SpendingGroup } from '../../services/api/spendingSummary';

/**
 * "What is this month made of?" — the signature of the kitchen-table direction.
 *
 * One continuous bar sliced into segments, with the legend carrying every
 * segment's value as text.
 *
 * ── THE RULE THIS COMPONENT EXISTS TO EMBODY ────────────────────────────────
 *
 * **Show a dimension only when that dimension varies.** The owner's first
 * question about this design was what it does on a one-user instance, and the
 * answer is that a bar sliced by person degrades to one full-width block saying
 * nothing — and for a self-hosted finance app, one user is likely the *majority*
 * case rather than the edge case.
 *
 * So: **one user slices by category, two or more slice by person**, and the
 * `By person / By category` toggle appears **only** in the second case, because
 * only then are there genuinely two readings. The device and the question are
 * unchanged; only the answer moves.
 *
 * ── FIRST RUN OMITS THE BAR RATHER THAN DRAWING AN EMPTY ONE ────────────────
 *
 * A bar of nothing is a broken bar. With no spending there is nothing to slice,
 * so the component renders `null` and the dashboard shows its invitation
 * instead. Drawing a grey full-width track with a `£0.00` legend would be an
 * affordance that lies about having data.
 */

export type ShareBarAxis = 'person' | 'category';

interface ShareBarProps {
  /** Household size — decides whether the person axis exists at all. */
  memberCount: number;
  byCategory: SpendingGroup[];
  byPerson: SpendingGroup[];
  currency: string;
  /** Test seam only: the axis to start on when both are available. */
  initialAxis?: ShareBarAxis;
}

/** Five paints, then everything else folds into the last one. */
const MAX_SEGMENTS = 5;

/**
 * The five segment colours are `--kt-seg-*`, measured against the app's own card
 * rather than the mockup's: every one clears the 3.0 non-text floor WCAG 1.4.11
 * asks of a graphical object (light 3.14–5.17, dark 4.36–8.40).
 *
 * *** ADJACENT SEGMENTS ARE NOT DISTINGUISHABLE BY LUMINANCE, AND THAT IS
 * DELIBERATELY NOT FIXED WITH NEW HUES. *** Measured against each other in
 * light: 1.03, 1.06, 1.64 and — for segments 4 and 5 — **1.00**, identical
 * luminance. The hues are owner-approved, so the fix is a **1px separator in the
 * card colour** between segments, which is the cheap structural answer the
 * design notes recommended rather than repainting anything.
 */
const SEGMENT_VARS = [
  'var(--kt-seg-1)',
  'var(--kt-seg-2)',
  'var(--kt-seg-3)',
  'var(--kt-seg-4)',
  'var(--kt-seg-5)',
];

/** Top four by value, with the tail folded into a fifth "Everything else". */
export function toSegments(groups: SpendingGroup[]): SpendingGroup[] {
  const sorted = [...groups].filter((g) => g.total > 0).sort((a, b) => b.total - a.total);
  if (sorted.length <= MAX_SEGMENTS) return sorted;

  const head = sorted.slice(0, MAX_SEGMENTS - 1);
  const tail = sorted.slice(MAX_SEGMENTS - 1);
  return [
    ...head,
    {
      key: '__rest__',
      label: `${tail.length} more`,
      total: tail.reduce((sum, g) => sum + g.total, 0),
      count: tail.reduce((sum, g) => sum + g.count, 0),
    },
  ];
}

export const ShareBar: React.FC<ShareBarProps> = ({
  memberCount,
  byCategory,
  byPerson,
  currency,
  initialAxis,
}) => {
  // The person axis exists only when there is more than one person.
  const personAxisVaries = memberCount > 1;
  const [axis, setAxis] = useState<ShareBarAxis>(
    initialAxis ?? (personAxisVaries ? 'person' : 'category')
  );

  const effectiveAxis: ShareBarAxis = personAxisVaries ? axis : 'category';
  const segments = toSegments(effectiveAxis === 'person' ? byPerson : byCategory);
  const total = segments.reduce((sum, s) => sum + s.total, 0);

  // FIRST RUN: omit, never draw empty. A bar of nothing is a broken bar.
  if (!segments.length || total <= 0) return null;

  return (
    <div className="fp-sharebar" data-axis={effectiveAxis}>
      <div className="fp-sharebar-head">
        <p className="fp-sharebar-title">
          {formatMoney(total, { currency })} went out this month
        </p>

        {/* The toggle appears ONLY when both readings exist. On a one-user
            instance "by person" is not a second view, it is the same bar with a
            different label, and offering it would be an affordance that lies. */}
        {personAxisVaries && (
          <div className="fp-sharebar-toggle" role="group" aria-label="Slice the month by">
            {(['person', 'category'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={axis === option}
                onClick={() => setAxis(option)}
              >
                {option === 'person' ? 'By person' : 'By category'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        className="fp-sharebar-track"
        role="img"
        aria-label={`Spending this month by ${effectiveAxis}: ${segments
          .map((s) => `${s.label} ${formatMoney(s.total, { currency })}`)
          .join(', ')}`}
      >
        {segments.map((segment, i) => (
          <div
            key={String(segment.key ?? segment.label)}
            className="fp-sharebar-segment"
            style={{
              width: `${(segment.total / total) * 100}%`,
              background: SEGMENT_VARS[i % SEGMENT_VARS.length],
            }}
          />
        ))}
      </div>

      {/* WCAG 1.4.1: every segment's value is here as TEXT, so the bar never
          carries meaning by colour alone — which is also what makes the
          adjacent-luminance finding a polish issue rather than a blocker. */}
      <ul className="fp-sharebar-legend">
        {segments.map((segment, i) => (
          <li key={String(segment.key ?? segment.label)}>
            <span
              className="fp-sharebar-dot"
              style={{ background: SEGMENT_VARS[i % SEGMENT_VARS.length] }}
            />
            <span className="fp-sharebar-label">{segment.label}</span>
            <span className="fp-sharebar-value">
              {formatMoney(segment.total, { currency })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
