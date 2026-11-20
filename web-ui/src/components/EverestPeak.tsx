import React from 'react';
import { RANGE_SILHOUETTES } from '../utils/rangeSilhouettes';
import { EVEREST_SLUG, climberPoint, profileFloor, profileFor } from '../utils/realRange';

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
  /* *** ON THE REAL SKYLINE (design move 3, 2026-11-20). *** The shape is generated from Everest's real
     elevation profile (`boxSilhouette`: transect across the 100 box, lowest ground at y=100, summit at y=4), so
     the marker is placed where that same skyline reaches the altitude, in the same box. It used to ride a fixed
     x=46 at a fraction of the box height, which on the real outline would float above the rock near the top.
     Below the transect's lowest ground (about 5,200 m) the climber stands at the foot, on the ground line. */
  void summit_m;
  const profile = profileFor(EVEREST_SLUG)!;
  const floor = profileFloor(profile);
  const pxPerM = 96 / (profile.elevation_m - floor);
  const at = climberPoint(profile, {
    x: 0, groundY: 100 + floor * pxPerM, pxPerM, pxPerMx: 100 / profile.length_m,
  }, altitude_m);
  const markerX = at.x;
  const markerY = Math.min(at.y, 100);
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
      <circle data-testid="everest-peak-marker" cx={markerX} cy={markerY} r="3.4"
        fill="var(--status-warn)" stroke="var(--bg-card)" strokeWidth="1" />
    </svg>
  );
};

export default EverestPeak;
