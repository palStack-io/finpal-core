import React, { useEffect, useState } from 'react';

/**
 * A piece of learnPal gear.
 *
 * *** SVG IF THE FILE IS THERE, EMOJI IF IT IS NOT. *** Owner decision
 * 2026-09-11: *"make a path on the folder for svg with the names they need to be
 * with fallback to emoji when no svg found."* Dropping a correctly-named file
 * into `public/gear/` is the whole migration — no code change, no release
 * coupling between the artwork and the engine.
 *
 * *** THE SVG IS INLINED, NOT PUT IN AN `<img src>`, AND THAT IS THE WHOLE
 * REASON THIS COMPONENT EXISTS. *** An `<img>` cannot inherit `color`, so
 * `fill="currentColor"` inside the file would resolve to nothing and every icon
 * would be invisible in one theme or the other. Inlining lets the icon take the
 * colour of whatever it sits in. That is the same bug class as D-60 and the
 * hardcoded-hex checks elsewhere, in a new costume.
 *
 * Files are fetched once and cached for the page's lifetime. They are served
 * from `public/`, so they are NOT in the JS bundle and cost nothing until a
 * gear icon is actually rendered.
 *
 * **Mobile deliberately does this differently** — `mobile/src/components/
 * GearIcon.tsx` uses PNG assets with `tintColor`, because embedding the same
 * path data in a React Native bundle measured **89.3 KB gzip against a 367 KB
 * app** while the PNGs are native assets outside the bundle entirely. Measured,
 * not assumed; see the roadmap.
 */

/**
 * The fallback glyph per gear slug.
 *
 * *** §5.2 BANS EMOJI AS THE SHIPPED ARTWORK AND THIS DOES NOT OVERRIDE THAT.
 * *** B10 shipped glyphs that rendered as `?` boxes on a real device while every
 * test stayed green. These are scaffolding so a milestone with no drawing yet
 * still renders something, and each one is a widely-supported glyph rather than
 * a clever one.
 */
export const GEAR_EMOJI: Record<string, string> = {
  map: '🗺️', boots: '🥾', rope: '🪢', headlamp: '🔦', 'ice-axe': '⛏️',
  gloves: '🧤', compass: '🧭', 'trekking-poles': '🥢', tent: '⛺', oxygen: '🫁',
  bivvy: '🛌', 'water-bottle': '💧', cache: '📦', 'alpine-start': '⏰',
  thermometer: '🌡️', signpost: '🪧', 'pack-scale': '⚖️', 'slope-gauge': '📐',
  carabiner: '🔗', helmet: '⛑️', guidebook: '📖',
};

/** slug -> markup, or `null` once we know there is no file. */
const cache = new Map<string, string | null>();

interface GearIconProps {
  slug: string;
  /** Rendered px. The SVG has no intrinsic size, so this is the only source. */
  size?: number;
  /** Screen-reader label. Omit for decoration beside a visible name. */
  label?: string;
}

export const GearIcon: React.FC<GearIconProps> = ({ slug, size = 24, label }) => {
  const [markup, setMarkup] = useState<string | null | undefined>(() => cache.get(slug));

  useEffect(() => {
    if (cache.has(slug)) { setMarkup(cache.get(slug)); return; }
    let alive = true;
    fetch(`/gear/${slug}.svg`)
      .then((r) => (r.ok ? r.text() : null))
      .then((text) => {
        // *** THE `<svg` PREFIX IS THE WHOLE GUARD, AND IT IS LOAD-BEARING. ***
        // An SPA dev server answers an unknown path with index.html and a
        // STATUS 200, so `r.ok` alone would cache the entire application as an
        // icon and render it inside a 24px box.
        //
        // A content-type check sat here too until a sabotage proved it was not
        // pulling its weight: removing it left every test green, because this
        // line already catches the HTML case. It was also strictly harmful —
        // a genuine SVG served as `text/plain` would have been REJECTED. A
        // redundant check with a false justification is worse than no check.
        const value = text && text.trim().startsWith('<svg') ? text : null;
        cache.set(slug, value);
        if (alive) setMarkup(value);
      })
      .catch(() => { cache.set(slug, null); if (alive) setMarkup(null); });
    return () => { alive = false; };
  }, [slug]);

  const common: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: size, height: size, lineHeight: 1, flexShrink: 0,
  };

  // Undefined = still loading. Render the box but nothing in it, so the layout
  // does not jump when the file arrives.
  if (markup === undefined) return <span style={common} aria-hidden="true" />;

  if (markup === null) {
    return (
      <span
        style={{ ...common, fontSize: size * 0.9 }}
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      >
        {GEAR_EMOJI[slug] ?? '•'}
      </span>
    );
  }

  return (
    <span
      style={common}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      // The file is ours, served from our own `public/` directory, and is
      // written by the build rather than by a user. It is not user input.
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
};
