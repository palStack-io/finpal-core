/**
 * The range a user with no goals sees: the shape of the thing, and an invitation.
 *
 * *** THIS OVERRIDES A RECORDED DECISION, SO THE DECISION AND THE OVERRIDE ARE
 * BOTH WRITTEN DOWN. *** `Dashboard` used to render nothing here, with the
 * reason stated in `GoalRange`: *"an empty frame here would be decoration
 * standing in for a fact, and the 'you have nothing yet' case belongs to base
 * camp."* That rule is right and this does not break it — what it forbids is a
 * frame that LOOKS like data. Owner, 2026-09-16: a new user should see
 * silhouettes and be told what to do.
 *
 * *** SO THE LINE THIS HAS TO NOT CROSS IS "LOOKS LIKE DATA", AND IT IS DRAWN
 * DELIBERATELY. *** No figures, no elevations, no percentages, no labels, no
 * ground-line marker, no band names — every one of which `GoalRange` draws from
 * something real. These are flat silhouettes at a third of the opacity, evenly
 * spaced rather than sorted by height, with nothing beside them that could be
 * read as a number. It is a picture of what this panel is FOR, not a picture of
 * a portfolio somebody does not have. That distinction is the whole of D-102.
 *
 * *** AND THE ART IS IMPORTED, NOT REDRAWN. *** Same `RANGE_SILHOUETTES` the
 * real range uses, so an empty dashboard and a full one are recognisably the
 * same mountains. A copied `d` attribute is one that drifts.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { RANGE_SILHOUETTES } from '../../utils/rangeSilhouettes';

const BOX_W = 1100;
const BOX_H = 200;
const GROUND = 190;

/**
 * `[x, scaleX, scaleY, band]`. Five peaks, deliberately NOT in height order —
 * a sorted range is what `GoalRange` draws from real magnitudes, and echoing
 * that arrangement here would be the placeholder imitating data.
 */
const PLACEHOLDER: Array<[number, number, number, number]> = [
  [40, 1.45, 0.70, 0],
  [250, 1.30, 0.92, 2],
  [470, 1.55, 1.15, 3],
  [730, 1.25, 0.84, 1],
  [930, 1.40, 0.62, 0],
];

export const EmptyRange: React.FC = () => (
  <div style={{ position: 'relative' }}>
    <svg
      viewBox={`0 0 ${BOX_W} ${BOX_H}`}
      preserveAspectRatio="xMidYMax meet"
      role="img"
      aria-label="No goals yet — an outline of the mountain range your goals would be drawn as"
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      {PLACEHOLDER.map(([x, sx, sy, band], i) => (
        <g key={i} transform={`translate(${x},${GROUND - 100 * sy}) scale(${sx},${sy})`}>
          {/* Body only — no shade and no snow. Those are the details that make
              a peak look rendered rather than sketched, and a sketch is the
              honest register for a thing that does not exist yet. */}
          <path d={RANGE_SILHOUETTES[band].body} fill="var(--head-ridge)" opacity={0.45} />
        </g>
      ))}
      <rect x={0} y={GROUND} width={BOX_W} height={3} fill="var(--head-ridge)" opacity={0.6} />
    </svg>

    {/* *** THE MARKER IS A REAL LINK, NOT A HOVER TOOLTIP. ***
        The owner asked for a "!" that says "set goals" on hover. Hover alone is
        unreachable by keyboard and invisible on a touch screen — two thirds of
        the ways into this app. So it is a `<Link>`: it has an accessible name,
        it is in the tab order, it works on a tap, and the sentence appears on
        `:hover` AND `:focus-visible` through `.fp-empty-range-hint`. The `title`
        attribute is there as well for a slow mouse hover, which is the only
        thing hover was ever going to give.

        It also DOES something rather than merely explaining: the whole point of
        an empty state is the next action, and reading a tooltip is not one. */}
    <Link
      to="/goals"
      className="fp-empty-range-cta"
      title="Set a goal and it appears here as a mountain"
      aria-label="Set a goal and it appears here as a mountain"
    >
      <span aria-hidden="true" className="fp-empty-range-bang">!</span>
      <span className="fp-empty-range-hint">Set a goal and it appears here as a mountain</span>
    </Link>
  </div>
);

export default EmptyRange;
