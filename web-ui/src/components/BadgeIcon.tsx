import React, { useEffect, useState } from 'react';
import { GearIcon } from './GearIcon';
import { badgeGlyph } from '../utils/badgeGlyph';

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
 * *** BADGE ART LIVES IN `/badges/`, NOT `/gear/`, AND THAT MISMATCH WAS A
 * REAL BUG. *** The art spec (`2026-09-17-contributor-badge-art-prompt.md`)
 * has always said files go to `public/badges/<slug>.svg` — and this component
 * delegated straight to `GearIcon`, which only ever looks in `/gear/`. Art
 * dropped where the spec said would have rendered NOTHING, silently, on both
 * clients. Two directories is also the right shape: it is what stops a badge
 * and a purchasable gear piece ever being the same file, which is D-219 in
 * storage rather than on screen.
 *
 * *** THE FALLBACK IS WHAT MAKES THE ART OPTIONAL. *** With no badge file,
 * `badgeGlyph` borrows a gear drawing, which is what ships today. Dropping a
 * correctly-named file into `public/badges/` is the whole migration — no code
 * change, no release coupling, exactly what the gear promised and got.
 */

/** slug -> markup, or `null` once we know there is no badge-specific file. */
const cache = new Map<string, string | null>();

export const BadgeIcon: React.FC<{
  slug?: string | null;
  size?: number;
  title?: string;
}> = ({ slug, size = 24, title }) => {
  const [markup, setMarkup] = useState<string | null | undefined>(
    () => (slug ? cache.get(slug) : null));

  useEffect(() => {
    if (!slug) return;
    if (cache.has(slug)) { setMarkup(cache.get(slug)); return; }
    let alive = true;
    fetch(`/badges/${slug}.svg`)
      .then((r) => (r.ok ? r.text() : null))
      .then((text) => {
        /* *** THE `<svg` PREFIX IS THE WHOLE GUARD. *** An SPA dev server
           answers an unknown path with index.html and a status 200, so `r.ok`
           alone would cache the entire application as an icon. Same guard
           `GearIcon` carries, and for the same measured reason. */
        const value = text && text.trim().startsWith('<svg') ? text : null;
        cache.set(slug, value);
        if (alive) setMarkup(value);
      })
      .catch(() => { cache.set(slug, null); if (alive) setMarkup(null); });
    return () => { alive = false; };
  }, [slug]);

  // *** THE DISC INSETS THE GLYPH, SO A SMALL `size` HURTS MORE HERE THAN IT
  // DID FOR BARE GEAR. *** At 58% a 32px disc leaves an 18.6px drawing.
  // `gearIsLegible.test.ts` holds callers to a floor rather than clamping
  // here: silently resizing would hide the caller's mistake.
  const glyph = Math.round(size * 0.58);

  const shell: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    border: '1.5px solid var(--border-medium)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    boxSizing: 'border-box',
  };

  return (
    <span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-testid="badge-icon"
      title={title}
      style={shell}
    >
      {markup
        ? <span style={{ width: glyph, height: glyph, display: 'inline-flex' }}
                // The file is ours, served from our own `public/` directory.
                dangerouslySetInnerHTML={{ __html: markup }} />
        /* No badge-specific art: borrow a gear drawing. `markup === undefined`
           (still fetching) takes this branch too, so the disc never flashes
           empty on a badge that has always had a fallback. */
        : <GearIcon slug={badgeGlyph(slug ?? '')} size={glyph} />}
    </span>
  );
};
