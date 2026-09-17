import React from 'react';
import { GearIcon } from './GearIcon';

/**
 * A learnPal badge: the glyph of a piece of kit, struck on a disc.
 *
 * *** THIS COMPONENT EXISTS TO CLOSE D-219, AND THE DEFECT WAS A REAL ONE. ***
 * Measured 2026-09-15: `LearnMilestone.gear_slug` held **19** slugs,
 * `GEAR_PRICES` held **21**, and the intersection was **19**. learnPal was
 * handing out, free, the same objects the shop sells for 700 to 2,400 coins.
 * The whole reason the design has two reward types is that *"a badge is a
 * stamped disc you were given and gear is equipment you bought"* and that
 * *"studying cannot flatter your finances"* — and neither held in shipped code.
 * Owner decision, 2026-09-17: badges REUSE THE GLYPH inside a disc.
 *
 * *** WHY THIS AND NOT NEW ARTWORK. *** The 21 drawings already exist and are
 * good. New badge assets would have blocked the fix on art nobody had drawn,
 * and giving lessons nothing at all would have stripped learnPal's pages of
 * their only per-lesson image. A disc is the cheapest change that makes the
 * two things VISIBLY different objects rather than the same object with two
 * origins.
 *
 * *** THE DISC IS THE WHOLE POINT, SO IT IS NOT DECORATION. *** A badge must
 * not be mistakable for equipment at a glance, or the distinction is a caption
 * nobody reads. The ring and the inset are what a reader actually sees; the
 * glyph only says WHICH badge.
 *
 * *** IT CLAIMS NOTHING ABOUT MONEY, SO IT CANNOT LIE. *** Same property the
 * climber has: a badge is narrative, not a figure.
 */
export const BadgeIcon: React.FC<{
  slug?: string | null;
  size?: number;
  title?: string;
}> = ({ slug, size = 24, title }) => {
  // *** THE DISC INSETS THE GLYPH, SO A SMALL `size` IS WORSE HERE THAN IT WAS
  // FOR BARE GEAR. *** The design already recorded that the 21 drawings ship
  // rendered at ~14px in a row of five, "where it is illegible — a sizing
  // decision, not a missing asset". At 58% a 20px disc leaves an 11.6px glyph,
  // which is smaller still. `gearIsLegible.test.ts` holds callers to a floor
  // rather than clamping here: silently resizing would hide the caller's
  // mistake and leave the layout guessing.
  const glyph = Math.round(size * 0.58);

  return (
    <span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-testid="badge-icon"
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        /* A struck disc: a ring plus a slightly recessed face. Both tokens are
           role tokens already measured by `tokenContrast.test.ts`. */
        border: '1.5px solid var(--border-medium)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-secondary)',
        boxSizing: 'border-box',
      }}
    >
      <GearIcon slug={slug ?? undefined} size={glyph} />
    </span>
  );
};
