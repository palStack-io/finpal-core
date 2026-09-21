import React from 'react';
import { GearIcon } from './GearIcon';
import { BADGE_ART, badgeGlyph } from '../utils/badgeGlyph';

/**
 * A badge: its own drawing if one exists, otherwise a borrowed gear glyph,
 * struck on a disc.
 *
 * *** THE DISC IS THE WHOLE POINT, SO IT IS NOT DECORATION. *** Owner
 * decision 2026-09-17, closing D-219: learnPal was handing out, free, the
 * same 21 objects the shop sells for 700–2,400 coins. A badge must not be
 * mistakable for equipment at a glance, or the distinction is a caption
 * nobody reads.
 *
 * *** IT MASKS RATHER THAN FETCHES, FOR THE REASON `GearIcon`'s DOCSTRING
 * SETS OUT. *** Every glyph in the app rendered as an empty box in a real
 * browser while Playwright saw them fine; the difference was the request
 * TYPE, and a mask goes through the image pipeline rather than `fetch`.
 *
 * *** BADGE ART LIVES IN `/badges/`, GEAR IN `/gear/`, AND TWO DIRECTORIES
 * IS THE POINT. *** It is what stops a badge and a purchasable gear piece
 * ever being the same file — D-219 in storage rather than on screen.
 * `BADGE_ART` says which slugs have their own drawing; anything else borrows
 * one through `badgeGlyph`. Asking for art that does not exist cost 480
 * console errors in a single walkthrough before that set existed.
 */
export const BadgeIcon: React.FC<{
  slug?: string | null;
  size?: number;
  title?: string;
}> = ({ slug, size = 24, title }) => {
  // *** THE DISC INSETS THE GLYPH, SO A SMALL `size` HURTS MORE HERE THAN IT
  // DID FOR BARE GEAR. *** At 58% a 32px disc leaves an 18.6px drawing.
  // `gearIsLegible.test.ts` holds callers to a floor rather than clamping
  // here: silently resizing would hide the caller's mistake.
  const glyph = Math.round(size * 0.58);
  const own = slug && BADGE_ART.has(slug);
  const url = own ? `url("/badges/${slug}.svg")` : null;

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
        /* A struck disc: a ring plus a slightly recessed face. Both tokens
           are role tokens already measured by `tokenContrast.test.ts`. */
        border: '1.5px solid var(--border-medium)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-secondary)',
        boxSizing: 'border-box',
      }}
    >
      {url ? (
        <span
          aria-hidden="true"
          data-badge={slug}
          style={{
            width: glyph, height: glyph, display: 'inline-block',
            backgroundColor: 'currentColor',
            maskImage: url, WebkitMaskImage: url,
            maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center', WebkitMaskPosition: 'center',
            maskSize: 'contain', WebkitMaskSize: 'contain',
          }}
        />
      ) : (
        /* No badge-specific art: borrow a gear drawing. */
        <GearIcon slug={badgeGlyph(slug ?? '')} size={glyph} />
      )}
    </span>
  );
};
