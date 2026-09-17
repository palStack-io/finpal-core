import React from 'react';
import { useEverest } from '../../contexts/CoinAwardContext';

/**
 * Your altitude on the shared climb, as one line.
 *
 * *** NOT DRAWN HERE, AND THAT IS THE DECISION, NOT A SHORTCUT (spec §14.10).
 * *** Two mountain pictures on one page read as one confusing picture. The
 * dashboard already draws `GoalRange` — the user's OWN peaks, sized by what
 * each goal asks, from their money. Everest measures EFFORT. Drawing both
 * would blur the one distinction that keeps the range honest, so Everest is a
 * figure here and Kit is the only surface that draws it.
 *
 * *** AND IT IS NOT THE HERO, FOR A REASON WORTH KEEPING. *** The dashboard is
 * where somebody looks to judge how they are doing financially. An effort
 * score at the centre of it is exactly the mixing that retiring parked
 * decision 3 was protecting against: a good month of admin must not make the
 * money page look better.
 *
 * *** RENDERS NOTHING AT ZERO. *** A brand-new user standing at 0 m is told
 * they have climbed nothing, on the page they came to for reassurance. It
 * appears once they have actually earned something.
 */
export const EverestLine: React.FC = () => {
  const everest = useEverest();

  if (!everest || everest.altitude_m <= 0) return null;

  return (
    <div
      data-testid="everest-line"
      style={{
        display: 'flex', alignItems: 'baseline', gap: 8,
        fontSize: 13, color: 'var(--text-secondary)',
      }}
    >
      <span style={{ fontWeight: 700, color: 'var(--status-warn)' }}>
        {everest.altitude_m.toLocaleString()} m
      </span>
      <span>
        {everest.at_summit
          ? 'the summit of Everest, and every act you can finish is finished'
          : `up Everest of ${everest.summit_m.toLocaleString()} m`}
      </span>
    </div>
  );
};
