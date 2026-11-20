import React from 'react';
import { RANGE_SILHOUETTES } from '../utils/rangeSilhouettes';

/**
 * Everest, with a marker where the user stands — the basecamp's backdrop.
 *
 * *** THE SAME SILHOUETTE AS THE DASHBOARD RANGE, SO IT IS ONE MOUNTAIN. ***
 * The last `RANGE_SILHOUETTES` entry is Everest everywhere it is drawn.
 *
 * *** DECORATION, AND IT PRINTS NO FIGURE. *** The altitude is written in the
 * climb card beside it; drawing the number here too would put one figure on
 * one page through two code paths, free to drift (see Profile's own note).
 * So: `aria-hidden`, a marker, and nothing to read.
 *
 * *** NO TRACK UNDER THE MARKER. *** A track is a denominator; the range
 * refuses one for the same reason.
 */
export const EverestPeak: React.FC<{
  altitude_m: number;
  summit_m: number;
  /** Rendered height in px; width follows the silhouette. */
  height?: number;
}> = ({ altitude_m, summit_m, height = 200 }) => {
  const shape = RANGE_SILHOUETTES[RANGE_SILHOUETTES.length - 1];
  const f = summit_m > 0 ? Math.min(1, Math.max(0, altitude_m / summit_m)) : 0;
  // Measured from the ground up, as the range does: the ridge line of the
  // shape is not known here, so the marker rides the peak's centre line. A
  // floor of 4 keeps a climber at base camp on the ground, not below it.
  const markerY = 100 - Math.max(f * 100, 4);
  return (
    <svg
      data-testid="everest-peak"
      className="everest-peak"
      viewBox="-4 -8 108 110"
      aria-hidden="true"
      focusable="false"
      style={{ height, width: 'auto', display: 'block' }}
    >
      <defs>
        <linearGradient id="everest-peak-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000000" stopOpacity="0.02" />
          <stop offset="1" stopColor="#000000" style={{ stopOpacity: 'var(--range-shade-max)' }} />
        </linearGradient>
      </defs>
      <g color="var(--peak-unmeasured)">
        <path d={shape.body} fill="currentColor" />
        {shape.shade && <path d={shape.shade} fill="url(#everest-peak-shade)" />}
        {shape.snow && (
          <path d={shape.snow} fill="var(--peak-snow)" opacity={shape.snowOpacity ?? 0.9} />
        )}
      </g>
      <line x1="-4" y1="100" x2="104" y2="100" stroke="var(--border-medium)" strokeWidth="1" />
      <circle data-testid="everest-peak-marker" cx="46" cy={markerY} r="3.4"
        fill="var(--status-warn)" stroke="var(--bg-card)" strokeWidth="1" />
    </svg>
  );
};

export default EverestPeak;
