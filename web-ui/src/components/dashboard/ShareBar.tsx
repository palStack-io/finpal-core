import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
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
  /**
   * Suppress the built-in heading, for a caller that already has one.
   *
   * The dashboard wraps this in a titled card now — "Where September went" —
   * and two headings in one card is the duplication this page has been losing
   * all week. `/analytics` still uses the built-in one.
   */
  hideTitle?: boolean;
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

/**
 * A segment, plus — on the folded one — what was folded into it.
 *
 * *** THE TAIL IS CARRIED, NOT DISCARDED, SO THE LEGEND CAN OPEN. *** It used
 * to be summed and thrown away, which is why `5 more $133.67` was a dead end:
 * the categories behind it existed nowhere on the page, and "View all" goes to
 * `/transactions`, not to a breakdown. FINPAL-25.
 */
export type Segment = SpendingGroup & { folded?: SpendingGroup[] };

/** Top four by value, with the tail folded into a fifth "Everything else". */
export function toSegments(groups: SpendingGroup[]): Segment[] {
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
      folded: tail,
    },
  ];
}

export const ShareBar: React.FC<ShareBarProps> = ({
  hideTitle = false,
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

  /*
   * *** THE LEGEND OPENS; THE BAR DOES NOT. ***
   *
   * `5 more` was a legend row styled exactly like the four real ones, so it
   * read as a control and was not one — and nothing else in the app showed
   * what it hid. Opening it lists those categories underneath.
   *
   * The BAR deliberately keeps its five segments. Splitting it to nine would
   * need nine colours; there are five, and segments 4 and 5 already measure
   * **1.00** against each other — identical luminance, per the note above.
   * Adding four more hues to a palette that cannot separate the two it has is
   * the repaint that note exists to refuse.
   *
   * Reset when the axis flips: "5 more" means different things by person and
   * by category, and an open disclosure carrying the other reading's rows is
   * a stale panel that looks current.
   */
  const [foldedOpen, setFoldedOpen] = useState(false);
  useEffect(() => setFoldedOpen(false), [effectiveAxis]);
  const total = segments.reduce((sum, s) => sum + s.total, 0);

  // FIRST RUN: omit, never draw empty. A bar of nothing is a broken bar.
  if (!segments.length || total <= 0) return null;

  return (
    <div className="fp-sharebar" data-axis={effectiveAxis}>
      <div className="fp-sharebar-head">
        {!hideTitle && (
          <p className="fp-sharebar-title">
            {formatMoney(total, { currency })} went out this month
          </p>
        )}

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
        {segments.map((segment, i) => {
          const dot = (
            <span
              className="fp-sharebar-dot"
              style={{ background: SEGMENT_VARS[i % SEGMENT_VARS.length] }}
            />
          );
          const money = (
            <span className="fp-sharebar-value">
              {formatMoney(segment.total, { currency })}
            </span>
          );

          /* The four real segments. A row, and nothing that looks otherwise. */
          if (!segment.folded?.length) {
            return (
              <li key={String(segment.key ?? segment.label)}>
                {dot}
                <span className="fp-sharebar-label">{segment.label}</span>
                {money}
              </li>
            );
          }

          /* *** THE FOLDED ONE IS A BUTTON, BECAUSE IT WAS ALREADY BEING READ
             AS ONE. *** A real <button> rather than a clickable <li> so it is
             reachable by keyboard and announced as a control; `aria-expanded`
             so the announcement says which way it is. */
          return (
            <li
              key={String(segment.key ?? segment.label)}
              className="fp-sharebar-folded"
              data-open={foldedOpen ? 'true' : undefined}
            >
              <button
                type="button"
                className="fp-sharebar-more"
                aria-expanded={foldedOpen}
                onClick={() => setFoldedOpen((open) => !open)}
              >
                {dot}
                <span className="fp-sharebar-label">{segment.label}</span>
                {money}
                <ChevronDown
                  size={13}
                  aria-hidden="true"
                  style={{
                    transform: foldedOpen ? 'rotate(180deg)' : undefined,
                    transition: 'transform 0.15s',
                    flex: 'none',
                  }}
                />
              </button>

              {foldedOpen && (
                /* *** NO DOTS ON THESE ROWS, ON PURPOSE. *** A dot promises a
                   band in the bar, and these have none — they are inside the
                   grouped segment. Indent says "part of the row above" without
                   claiming a colour the bar does not carry. */
                <ul className="fp-sharebar-sublegend">
                  {segment.folded.map((item) => (
                    <li key={String(item.key ?? item.label)}>
                      <span className="fp-sharebar-label">{item.label}</span>
                      <span className="fp-sharebar-value">
                        {formatMoney(item.total, { currency })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
