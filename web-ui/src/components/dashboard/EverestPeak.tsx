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

  // Geometry. The peak apex sits at (300, 24) and the base line at y=210, so
  // the climber's y interpolates between them by altitude.
  const APEX_Y = 24;
  const BASE_Y = 210;
  const climberY = BASE_Y - (BASE_Y - APEX_Y) * fraction;
  // The route leans right as it climbs, so the marker is never buried in the
  // silhouette's centre where it would be unreadable against the fill.
  const climberX = 300 + 70 * fraction;

  return (
    <section
      data-testid="everest-peak"
      aria-label={`Everest: ${everest.altitude_m} metres climbed of ${everest.summit_m}`}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        borderRadius: 16, padding: '20px 24px 8px', marginTop: 20,
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

      <svg
        viewBox="0 0 600 240"
        preserveAspectRatio="xMidYMax meet"
        role="img"
        aria-hidden="true"
        style={{ display: 'block', width: '100%', height: 'auto', marginTop: 4 }}
      >
        {/* ONE peak, not a range. The shoulders are asymmetric so it reads as
            a specific mountain rather than a generic triangle. */}
        <path
          d="M 60 210 L 230 96 L 300 24 L 372 104 L 430 70 L 540 210 Z"
          fill="var(--border-light)"
        />
        {/* The snowline: a lighter cap, which is what makes it read as Everest
            rather than as one more hill in the range above. */}
        <path
          d="M 300 24 L 372 104 L 340 112 L 300 92 L 262 116 L 230 96 Z"
          fill="var(--bg-secondary)"
        />

        {/* The route, dashed above the climber and solid below: what you have
            walked, and what is still yours to walk. */}
        <path
          d={`M 300 ${BASE_Y} Q 340 ${(BASE_Y + APEX_Y) / 2} 370 ${APEX_Y + 8}`}
          fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"
          strokeDasharray="4 5" opacity="0.5"
        />
        <path
          d={`M 300 ${BASE_Y} Q ${300 + climberX * 0.06} ${(BASE_Y + climberY) / 2} ${climberX} ${climberY}`}
          fill="none" stroke="var(--status-warn)" strokeWidth="2.5"
        />

        {/* The summit marker, and the climber. */}
        <circle cx="300" cy={APEX_Y} r="3.5" fill="var(--text-secondary)" />
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
