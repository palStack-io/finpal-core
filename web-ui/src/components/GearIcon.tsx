import React from 'react';

/**
 * A piece of gear, or the glyph a badge borrows.
 *
 * *** IT PAINTS A CSS MASK RATHER THAN FETCHING AND INLINING THE SVG, AND
 * THAT CHANGE FIXED A BUG NO GATE COULD SEE. *** 2026-09-20: every gear and
 * badge glyph in the app rendered as an empty box in the owner's browser,
 * app-wide — the shelf, the goal strips, the rail, Kit. Ruled out with
 * evidence: the file (200, correct bytes, and it loads fine typed straight
 * into a tab), Cloudflare (same on the Tailscale IP), the build (Playwright
 * hitting the identical URL rendered it), a service worker (none), a `fetch`
 * override (none), and socket starvation (no long-lived connections).
 *
 * What was left is the request TYPE. Opening the URL in a tab is a `document`
 * request; `fetch()` is an `xhr` request, and content blockers rule on those
 * separately. A rule that STALLS rather than rejects produces precisely the
 * observed symptom — no artwork AND no emoji fallback, because the old code
 * only fell back on a rejected promise and this one never settled.
 *
 * *** MOBILE WAS NEVER AFFECTED, WHICH IS THE TELL. *** It maps bundled PNGs
 * through a static `require`, so it makes no runtime request at all. A mask
 * is the web equivalent: it loads through the normal image pipeline, the
 * same way an `<img>` does.
 *
 * *** AND IT KEEPS THE ONE PROPERTY THE OLD VERSION EXISTED FOR. *** The
 * reason this component inlined the markup was that an `<img>` cannot
 * inherit `color`, so `fill="currentColor"` would resolve to nothing and
 * every icon would be invisible in one theme. A mask has no colour of its
 * own: `background-color: currentColor` paints THROUGH it, so the glyph
 * still takes the colour of whatever it sits in. Same guarantee, no fetch,
 * no cache map, no loading state, no `dangerouslySetInnerHTML`.
 *
 * *** THE FILES ARE STILL IN `public/`, NOT THE BUNDLE. *** Unchanged, and
 * for the reason the old docstring gave: they cost nothing until an icon is
 * actually rendered.
 */

/**
 * The fallback glyph per gear slug.
 *
 * *** §5.2 BANS EMOJI AS THE SHIPPED ARTWORK AND THIS DOES NOT OVERRIDE THAT.
 * *** B10 shipped glyphs that rendered as `?` boxes on a real device while
 * every test stayed green. These are scaffolding for a milestone whose
 * drawing has not landed, and each is a widely-supported glyph rather than a
 * clever one.
 *
 * *** IT IS NOW ONLY REACHABLE FOR AN UNKNOWN SLUG. *** A mask that fails to
 * load paints nothing rather than throwing, so this cannot be used as a
 * network fallback the way it was — which is honest: the old code claimed a
 * fallback it did not deliver, because a stalled fetch never reached it.
 */
export const GEAR_EMOJI: Record<string, string> = {
  map: '🗺️', boots: '🥾', rope: '🪢', headlamp: '🔦', 'ice-axe': '⛏️',
  gloves: '🧤', compass: '🧭', 'trekking-poles': '🥢', tent: '⛺', oxygen: '🫁',
  bivvy: '🛌', 'water-bottle': '💧', cache: '📦', 'alpine-start': '⏰',
  thermometer: '🌡️', signpost: '🪧', 'pack-scale': '⚖️', 'slope-gauge': '📐',
  carabiner: '🔗', helmet: '⛑️', guidebook: '📖',
};

/** The 21 drawings that exist in `public/gear/`. */
export const GEAR_SLUGS = Object.keys(GEAR_EMOJI);

interface GearIconProps {
  slug: string;
  /** Rendered px. The SVG has no intrinsic size, so this is the only source. */
  size?: number;
  /** Screen-reader label. Omit for decoration beside a visible name. */
  label?: string;
}

export const GearIcon: React.FC<GearIconProps> = ({ slug, size = 24, label }) => {
  const common: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: size, height: size, lineHeight: 1, flexShrink: 0,
  };

  /* An unknown slug has no file to mask, and a mask that cannot load paints
     nothing at all — so the emoji stands in rather than leaving a hole. */
  if (!GEAR_EMOJI[slug]) {
    return (
      <span
        style={{ ...common, fontSize: size * 0.9 }}
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      >
        {slug ? '•' : ''}
      </span>
    );
  }

  const url = `url("/gear/${slug}.svg")`;
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-gear={slug}
      style={{
        ...common,
        /* `currentColor` painted THROUGH the mask — this is what replaces
           `fill="currentColor"` on the inlined markup. */
        backgroundColor: 'currentColor',
        maskImage: url,
        WebkitMaskImage: url,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        /* `contain`, not `cover`: the drawings are square with their own
           margin, and cover would crop the edges of the wider ones. */
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
      }}
    />
  );
};
