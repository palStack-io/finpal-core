import React from 'react';
import { RANGE_SILHOUETTES, shapeSummit } from '../utils/rangeSilhouettes';

/**
 * The page hero's default art (Harun 2026-11-20, design brief "The page hero"): a quiet, decorative ridgeline along
 * the bottom edge of every hero that has no range of its own. The same real-ridge filled shapes as the Dashboard
 * range (`rangeSilhouettes.ts`, generated from real elevation profiles), each drawn at ONE uniform scale (never
 * stretched), low contrast, aria-hidden. It says nothing and holds no figure. It rises in once on a first visit and
 * is still under reduced motion (the CSS switches the keyframe off).
 */

/** [band, centre x, drawn height] on a 1200 x 96 box: low peaks first, a taller one right of centre. */
const PEAKS: Array<[number, number, number]> = [
  [1, 90, 46], [3, 300, 62], [0, 470, 38], [4, 700, 80], [2, 900, 56], [5, 1080, 88], [1, 1190, 44],
];
const H = 96;

export const HeroRidge: React.FC = () => (
  <svg className="fp-hero-ridge" data-testid="hero-ridge" viewBox={`0 0 1200 ${H}`}
    preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">
    {PEAKS.map(([band, cx, height], i) => {
      const shape = RANGE_SILHOUETTES[band];
      const [sx, sy] = shapeSummit(shape.body);
      const scale = height / (100 - sy);
      const x = cx - sx * scale * 1.4;
      return (
        <g key={i} transform={`translate(${x.toFixed(1)} ${(H - 100 * scale).toFixed(1)}) scale(${(scale * 1.4).toFixed(4)} ${scale.toFixed(4)})`}>
          <path d={shape.body} fill="currentColor" />
          {shape.shade && <path d={shape.shade} fill="#000000" opacity="0.18" />}
        </g>
      );
    })}
  </svg>
);

export default HeroRidge;
