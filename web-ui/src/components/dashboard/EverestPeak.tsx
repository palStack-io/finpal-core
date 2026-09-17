import React from 'react';
import { GearIcon } from '../GearIcon';
import { useBestGear, useEverest } from '../../contexts/CoinAwardContext';

/**
 * Everest, drawn: the one mountain every finPal user climbs.
 *
 * *** OWNER DECISION, 2026-09-17, OVERRIDING A RECOMMENDATION OF MINE. ***
 * I argued Everest should be a figure on the dashboard and drawn only on Kit,
 * because two mountain pictures on one page read as one confusing picture. The
 * owner wants it drawn, in the middle: *"we do need everest on dashboard. we
 * will place everest in the middle"*. Recorded as an override rather than
 * quietly reversed, because the concern it answers is real.
 *
 * *** SO THE CONCERN IS MANAGED BY MAKING THE TWO DRAWINGS DIFFERENT OBJECTS,
 * NOT BY SHRINKING ONE. *** `GoalRange` is MANY silhouettes standing on a
 * ground line, at varied heights, sized by what each goal asks. This is ONE
 * peak with a route up it and a climber somewhere on that route. A reader can
 * tell them apart at a glance without reading either caption, which is the
 * property that keeps the range honest: the range is the user's money, this is
 * their effort.
 *
 * *** IT CLAIMS NOTHING ABOUT ANYONE'S MONEY, SO IT CANNOT LIE. *** Altitude
 * comes from coins and lessons, never from balances. A good month of admin
 * moves this and moves no peak in the range.
 *
 * *** NO PERCENTAGE ANYWHERE. *** Two figures only: the metres climbed, and
 * 8,849 — a shared public fact identical for every user and derived from
 * nobody's finances, which is why it is the one ceiling this product prints.
 *
 * *** RENDERS NOTHING AT ZERO. *** A brand-new user standing at 0 m does not
 * get told they have climbed nothing on the page they came to for reassurance.
 * Base camp owns that case.
 */
export const EverestPeak: React.FC = () => {
  const everest = useEverest();
  const worn = useBestGear();

  if (!everest || everest.altitude_m <= 0) return null;

  const fraction = Math.min(1, everest.altitude_m / everest.summit_m);

  /**
   * The climber sits ON the left ridge, not beside the mountain.
   *
   * *** THE FIRST VERSION PUT THE ROUTE IN THE SKY. *** It interpolated x and
   * y independently, so the marker floated off the silhouette and the route
   * read as a stray diagonal. Rendered on the demo at 1440 and it was the
   * first thing wrong with the drawing. The ridge is two segments — base to
   * shoulder, shoulder to apex — and the altitude fraction is walked along
   * them, so the climber is always on the rock.
   */
  const BASE = { x: 60, y: 210 };
  const SHOULDER = { x: 230, y: 96 };
  const APEX = { x: 300, y: 24 };
  // The shoulder's share of the total rise, so the two segments are walked in
  // proportion to HEIGHT rather than to path length.
  const SHOULDER_F = (BASE.y - SHOULDER.y) / (BASE.y - APEX.y);

  let climberX: number;
  let climberY: number;
  if (fraction <= SHOULDER_F) {
    const t = SHOULDER_F === 0 ? 0 : fraction / SHOULDER_F;
    climberX = BASE.x + t * (SHOULDER.x - BASE.x);
    climberY = BASE.y - t * (BASE.y - SHOULDER.y);
  } else {
    const t = (fraction - SHOULDER_F) / (1 - SHOULDER_F);
    climberX = SHOULDER.x + t * (APEX.x - SHOULDER.x);
    climberY = SHOULDER.y - t * (SHOULDER.y - APEX.y);
  }

  return (
    <section
      data-testid="everest-peak"
      aria-label={`Everest: ${everest.altitude_m} metres climbed of ${everest.summit_m}`}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        borderRadius: 16, padding: '20px 24px 16px', marginTop: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 className="page-title" style={{ margin: 0, fontSize: 18 }}>
          The climb
        </h2>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {everest.at_summit
            ? 'You have finished every act available to you.'
            : 'Everyone climbs the same mountain. Yours moves when you tell finPal something true.'}
        </span>
      </div>

      {/*
        *** A FIXED HEIGHT, NOT `width: 100%` ALONE. *** The first version set
        only the width, so at 1440 the 600x240 viewBox scaled to 1152x461 — a
        near-empty half-screen of card. `height` plus `xMidYMax` keeps the
        drawing at a readable size and pins it to its own baseline whatever the
        column width.
      */}
      <svg
        viewBox="0 0 600 240"
        preserveAspectRatio="xMidYMax meet"
        role="img"
        aria-hidden="true"
        style={{ display: 'block', width: '100%', height: 200, marginTop: 8 }}
      >
        {/* ONE peak, not a range: asymmetric shoulders so it reads as a
            specific mountain. `fillOpacity` on a TEXT token rather than a
            border token, because `--border-light` measured invisible against
            the card on the demo — a border colour is for 1px lines, not for a
            200px fill. Opacity keeps it theme-safe: it is derived from a
            colour that is guaranteed to contrast with this surface. */}
        <path
          d="M 60 210 L 230 96 L 300 24 L 372 104 L 430 70 L 540 210 Z"
          fill="var(--text-secondary)" fillOpacity="0.18"
        />
        {/* The snowcap, a touch stronger so the summit reads. */}
        <path
          d="M 300 24 L 372 104 L 340 112 L 300 92 L 262 116 L 230 96 Z"
          fill="var(--text-secondary)" fillOpacity="0.32"
        />

        {/* The whole route along the ridge, dashed: what the climb is. */}
        <path
          d={`M ${BASE.x} ${BASE.y} L ${SHOULDER.x} ${SHOULDER.y} L ${APEX.x} ${APEX.y}`}
          fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"
          strokeDasharray="4 5" opacity="0.6"
        />
        {/* The part already walked, solid, over the top of it. */}
        <path
          d={fraction <= SHOULDER_F
            ? `M ${BASE.x} ${BASE.y} L ${climberX} ${climberY}`
            : `M ${BASE.x} ${BASE.y} L ${SHOULDER.x} ${SHOULDER.y} L ${climberX} ${climberY}`}
          fill="none" stroke="var(--status-warn)" strokeWidth="2.5"
          strokeLinejoin="round"
        />

        <circle cx={APEX.x} cy={APEX.y} r="3.5" fill="var(--text-secondary)" />
        <circle cx={climberX} cy={climberY} r="6" fill="var(--status-warn)" />
      </svg>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', paddingBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* The gear they actually bought, on the climber's line. This is the
              whole loop closing in one place: acts pay coins, coins buy kit,
              kit rides up the mountain with you. */}
          {worn && <GearIcon slug={worn} size={24} />}
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--status-warn)' }}>
            {everest.altitude_m.toLocaleString()} m
          </span>
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          summit {everest.summit_m.toLocaleString()} m
        </span>
      </div>
    </section>
  );
};
