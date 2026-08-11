/**
 * Runs INSIDE the page. Reports every element that either overflows its own box or
 * overhangs the shell, at whatever viewport CDP has emulated.
 *
 * *** WHY THIS IS NOT `documentElement.scrollWidth <= clientWidth`. ***
 *
 * The responsive design doc proposed exactly that as the primary gate. It cannot
 * work here, and the reason is in the app's own stylesheet: `.main-content` is
 * `overflow-x: hidden`. A clipper does not propagate its children's width to the
 * document, so the document measures clean while the content inside is cut off.
 * Measured on the real shell at 390px before writing this:
 *
 *     documentElement  390 / 390   <- the proposed gate PASSES
 *     .main-content    438 / 150   <- 438px of content in a 150px box
 *
 * The 288px that a user cannot reach, and has no scrollbar to reach with, is the
 * entire defect class Tier 3 exists to fix. So the gate is per-element, and the
 * document check is kept as a SEPARATE assertion — it still catches overflow that
 * escapes the shell (fixed-position elements, modals, a drawer scrim), which the
 * per-element sweep inside `.main-content` would miss.
 */
(() => {
  const TOL = 1; // subpixel layout noise; a real overflow is never 1px

  const de = document.documentElement;
  const main = document.querySelector('.main-content');
  if (!main) {
    window.__RESP = { error: 'no .main-content in the harness — the shell did not build' };
    return;
  }

  const mainRight = main.getBoundingClientRect().right;

  /**
   * A structural path, not a text snippet. The captures are regenerated
   * deterministically, so a path is stable run to run — and unlike a text or style
   * signature it survives the fix, which is what lets the baseline show an offender
   * DISAPPEARING rather than merely changing shape.
   */
  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n !== main && parts.length < 12; n = n.parentElement) {
      const i = n.parentElement ? [...n.parentElement.children].indexOf(n) : 0;
      parts.unshift(`${n.tagName.toLowerCase()}:${i}`);
    }
    return parts.join('>');
  };

  const offenders = [];
  const scrollers = [];
  let total = 0;
  let scrollable = 0;

  for (const el of main.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;

    /**
     * The visually-hidden idiom is a 1x1 clipped box holding real text, so it
     * reports as massively "clipped" by construction and always will. The seed run
     * flagged `MemberFilter.tsx:39` — `position:absolute; width:1; height:1;
     * overflow:hidden; clip:rect(0 0 0 0)` — as 88px of content in a 1px box on
     * every page and every width. That is an accessibility affordance working
     * correctly, and a gate that reports it is training people to ignore itself.
     */
    const clipped0 = cs.clip.replace(/[\s,]/g, '') === 'rect(0px0px0px0px)';
    if (clipped0 || (r.width <= 1 && r.height <= 1)) continue;

    total += 1;

    // An element the author made horizontally scrollable is Tier 3's INTENDED
    // outcome, not a defect. Counted separately so a fix can be asserted
    // positively — "this container scrolls" — rather than only by absence.
    const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    const selfOverflow = el.scrollWidth - el.clientWidth;
    if (scrolls) {
      if (selfOverflow > TOL) {
        scrollable += 1;
        /**
         * Recorded, not just counted. Tier 3's success condition is the INVERSE of
         * Tier 1's — the container is supposed to overflow, and to be reachable —
         * so absence of a complaint cannot prove the wrapper landed. A wrapper that
         * silently did not apply reads exactly like a fix that worked.
         */
        scrollers.push({
          path: pathOf(el),
          content: Math.round(el.scrollWidth),
          box: Math.round(el.clientWidth),
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28),
        });
      }
      continue;
    }

    const kinds = [];

    /**
     * Clipped, measured from IN-FLOW children only — not from `scrollWidth`.
     *
     * An absolutely-positioned child deliberately placed outside its parent and
     * clipped by it is a decoration, not lost content. The seed run flagged
     * BestCard's winner banner as 844px of content in an 824px box on every page
     * and every width, including 1440 where nothing is wrong: the 20px is exactly
     * the `right: -20` glow orb at `BestCard.tsx:187`, doing what it was written
     * to do. `scrollWidth` cannot tell that apart from a table being cut in half.
     */
    let inflowRight = 0;
    for (const child of el.children) {
      const ccs = getComputedStyle(child);
      if (ccs.position === 'absolute' || ccs.position === 'fixed') continue;
      if (ccs.display === 'none') continue;
      inflowRight = Math.max(inflowRight, child.getBoundingClientRect().right);
    }
    if (cs.overflowX === 'hidden' && inflowRight > r.right + TOL) {
      kinds.push('clipped');
    }

    /**
     * Overhang: the element sticks out past the shell's right edge. This is the
     * check that catches a fixed-track grid whose PARENT is the clipper — the grid
     * itself reports no self-overflow at all, so nothing else sees it.
     *
     * Skipped when something between here and the shell already clips or scrolls,
     * because containment is transitive: a child cannot escape a clipping ancestor
     * that itself fits, and if the ancestor does NOT fit then the ancestor is the
     * finding. Without this the gate reports one overflow once per descendant and
     * buries the cause under its own consequences.
     */
    let bounded = false;
    for (let p = el.parentElement; p && p !== main; p = p.parentElement) {
      const pcs = getComputedStyle(p);
      if (pcs.overflowX !== 'visible') { bounded = true; break; }
    }
    if (!bounded && r.right > mainRight + TOL) kinds.push('overhang');

    if (!kinds.length) continue;

    offenders.push({
      path: pathOf(el),
      kinds,
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 40),
      grid: cs.display.includes('grid') ? cs.gridTemplateColumns.slice(0, 80) : '',
      content: Math.round(el.scrollWidth),
      box: Math.round(el.clientWidth),
      over: Math.round(Math.max(selfOverflow, r.right - mainRight)),
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28),
    });
  }

  window.__RESP = {
    total,
    scrollable,
    doc: { content: de.scrollWidth, box: de.clientWidth },
    main: { content: main.scrollWidth, box: main.clientWidth, left: Math.round(main.getBoundingClientRect().left) },
    docOverflows: de.scrollWidth > de.clientWidth + TOL,
    offenders,
    scrollers,
  };
})();
