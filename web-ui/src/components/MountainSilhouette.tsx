import React from 'react';
import {
  MIN_MEASURED_HEIGHT, MOUNTAIN_SILHOUETTES, UNMEASURED_RIDGE,
  type MountainSilhouette as Silhouette,
} from '../utils/mountainSilhouettes';

export type PeakScale = 'cost' | 'build';

export interface MountainSilhouetteProps {
  /**
   * The band, 0 (Table Mountain) to 5 (Everest). `null` means UNMEASURED and
   * draws the flat ridge instead -- see `unmeasured` below, because the two
   * null-ish cases are not the same thing.
   */
  band: number | null;
  /** 0..100, straight from `peakGeometry().height`. Floored for a measured peak. */
  height: number;
  /** Which scale this peak is on. Chooses the colour, and the colour IS the rule. */
  scale: PeakScale;
  /** Pixels a full-height (100) peak occupies. Everything else scales from it. */
  maxPixelHeight: number;
  /**
   * WHICH DIMENSION IS PINNED. Both values scale uniformly and neither ever
   * stretches a path; they differ in what the eye is being asked to compare.
   *
   * `height` (default) pins the SUMMIT to the magnitude, so two peaks on the
   * same scale can be read against each other and a band boundary is continuous
   * -- £4.90 and £5.10 differ by 2% of summit height, not by 43%. The band then
   * shows up as the peak's WIDTH and its outline, which is how a real Table
   * Mountain differs from a real Everest.
   *
   * `width` pins every peak to the same width so the SHAPES line up, and the
   * height then comes from the band's box. That is the band LADDER -- a legend
   * of what the six mountains are, where magnitude is not being shown at all.
   *
   * *** DO NOT USE `width` ON A CARD OR THE RANGE. *** It makes summit height a
   * function of the band rather than of the money, so two goals a few pounds
   * apart across a boundary jump a whole step, and two goals with identical
   * figures in different bands draw at different heights.
   */
  fit?: 'height' | 'width';
  /**
   * *** UNMEASURED IS NOT THE SAME AS SMALL, AND IT IS NOT THE SAME AS ABSENT. ***
   * When true the ridge is drawn in the muted colour with no snow and no summit.
   * A caller with NO peak data at all must not render this component -- it must
   * render nothing, because "this backend predates mountains" has to look like
   * the old card and not like "we do not know your rate".
   */
  unmeasured?: boolean;
  /** Decoration behind a card. `aria-hidden`, and `title` is then ignored. */
  decorative?: boolean;
  /** Accessible name. Required unless `decorative`, or the shape says nothing. */
  title?: string;
  opacity?: number;
  style?: React.CSSProperties;
}

const colourFor = (scale: PeakScale, unmeasured: boolean): string =>
  unmeasured ? 'var(--peak-unmeasured)'
    : scale === 'cost' ? 'var(--peak-cost)' : 'var(--peak-build)';

/**
 * One mountain, scaled UNIFORMLY.
 *
 * *** SHAPE COMES FROM THE BAND, SIZE COMES FROM THE MAGNITUDE, AND THE PATHS ARE
 * NEVER STRETCHED. *** Each band's viewBox is `100 x boxHeight` with `boxHeight`
 * rising through the ladder, so rendering at a width proportional to the height
 * is both the uniform scale and the ladder at once.
 *
 * The width is DERIVED and is deliberately not a prop. Letting a caller pass both
 * is how the mockups ended up with `preserveAspectRatio="none"` on every peak,
 * and a stretched Table Mountain stops being Table Mountain -- the shape is the
 * only thing that makes the band readable without its label.
 *
 * `xMidYMax meet` is a no-op while the derived width is used, which is the point
 * of setting it: if a future caller forces a different width through `style`, it
 * letterboxes instead of silently distorting. `YMax` because a mountain is
 * anchored to its ground, never to its centre.
 */
export const MountainSilhouette: React.FC<MountainSilhouetteProps> = ({
  band, height, scale, maxPixelHeight, fit = 'height', unmeasured = false,
  decorative = false, title, opacity, style,
}) => {
  const shape: Silhouette = unmeasured || band === null
    ? UNMEASURED_RIDGE
    // Clamped rather than trusted: the band comes off a payload, and an
    // out-of-range index would otherwise be a blank card.
    : MOUNTAIN_SILHOUETTES[Math.min(MOUNTAIN_SILHOUETTES.length - 1, Math.max(0, Math.trunc(band)))];

  const isRidge = unmeasured || band === null;

  // The ridge has no magnitude, so it renders at its own box height and ignores
  // `height` entirely. A measured peak is floored so an explicit 0% APR draws as
  // the smallest real mountain rather than as nothing at all.
  const units = isRidge ? shape.boxHeight : Math.max(MIN_MEASURED_HEIGHT, height);

  // Both branches derive the second dimension from the first through the
  // viewBox's own ratio, which is what makes either one a uniform scale.
  const pixelHeight = fit === 'width'
    ? (maxPixelHeight * shape.boxHeight) / 100
    : (maxPixelHeight * units) / 100;
  const pixelWidth = fit === 'width'
    ? maxPixelHeight
    : (pixelHeight * 100) / shape.boxHeight;

  return (
    <svg
      width={pixelWidth}
      height={pixelHeight}
      viewBox={`0 0 100 ${shape.boxHeight}`}
      preserveAspectRatio="xMidYMax meet"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
      focusable="false"
      style={{ color: colourFor(scale, isRidge), opacity, display: 'block', ...style }}
    >
      {!decorative && title ? <title>{title}</title> : null}
      <path d={shape.body} fill="currentColor" />
      {shape.snow ? (
        <path d={shape.snow} fill="#ffffff" opacity={shape.snowOpacity ?? 0.85} />
      ) : null}
    </svg>
  );
};

export default MountainSilhouette;
