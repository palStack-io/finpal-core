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
    /*
     * *** AN <svg>'s `overflow: hidden` IS DEFINITIONAL, NOT A LAYOUT ACCIDENT
     * — BUT ONLY WHEN IT IS DECORATIVE. ***
     *
     * A viewBox works BY clipping: art placed outside it is meant to run off
     * the edge, the way a horizon does. `AuthShell`'s frieze puts peaks at
     * x=-30 and x=1140 in a 1200 box on purpose, so both ends continue past the
     * frame instead of stopping short of it — and this check reported all four
     * widths of four pages as "clipped" with **+0px of overflow**, because SVG
     * children cannot be `position: absolute` and so never hit the exemption
     * above them. Same false positive as D-245's icon rule, one property over.
     *
     * *** KEYED TO `aria-hidden`, NOT TO THE TAG. *** A blanket svg exemption
     * would blind this to a real defect: a CHART whose bars run past its own
     * viewBox is lost content, and this app now has one (`IncomeFlowChart`
     * carries `role="img"` and an `aria-label`, so it is still measured). What
     * is skipped is art the author has declared decorative — the same line
     * WCAG 1.4.11 draws, and the same one the contrast walk draws.
     */
    const decorativeSvg = el.tagName.toLowerCase() === 'svg'
      && (el.getAttribute('aria-hidden') === 'true'
          || el.getAttribute('role') === 'presentation');

    if (!decorativeSvg && cs.overflowX === 'hidden' && inflowRight > r.right + TOL) {
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

  /* ── A FOURTH THING, AND IT IS NOT OVERFLOW ────────────────────────────────
   * Text covered by something painted on top of it, INSIDE A PAGE HEAD.
   *
   * *** WHY THIS TIER EXISTS. *** `PageHead`'s first version placed its action
   * buttons at `position: absolute; top: 24px; right: 24px`. At 390px Accounts'
   * three buttons stacked straight down over the subtitle, so "what you have,
   * what you owe, and what it costs to owe it" rendered as "what you owe, c …
   * to owe it" — and this walk PASSED, at all four widths, in both themes,
   * because an overlap sits entirely inside the viewport and overflows nothing.
   * It was caught in a screenshot of the deployed demo.
   *
   * *** AND WHY IT IS SCOPED TO `.fp-page-head` RATHER THAN THE WHOLE PAGE. ***
   * A general overlap detector fires on every legitimate overlay this app has —
   * dropdowns, tooltips, badges pinned to a corner, the sidebar drawer — and a
   * gate that fails on an opinion is a gate that gets skipped. The page head has
   * no legitimate overlap: everything in it is in flow by design, which is
   * exactly the property that made the defect impossible rather than tuned out.
   * So this asserts that property directly, for all eleven pages as they adopt
   * it, and claims nothing about anywhere else.
   */
  const collisions = [];
  /**
   * *** THE RECTS ARE THE GLYPHS, NOT THE ELEMENT BOXES, AND THE FIRST VERSION
   * GOT THAT WRONG. *** An `<h1>` is a block, so its box spans the full column
   * whatever the word inside is: measuring boxes reported "Accounts is covered
   * by Import CSV" at 1440px, where the title ends around x=400 and the button
   * starts around x=1000 and nothing whatsoever overlaps. A gate whose stated
   * reason is false is the defect D-221 was — a written claim that does not
   * match what is on screen — and it is how a gate gets disbelieved and then
   * switched off.
   *
   * A `Range` over the element's own text nodes gives the LINE boxes, tight to
   * the text. Those are what a reader can actually see covered.
   */
  const textRects = (el) => {
    const out = [];
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim().length) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width > 1 && r.height > 1) out.push(r);
      }
      range.detach();
    }
    return out;
  };
  for (const head of document.querySelectorAll('.fp-page-head')) {
    const boxes = [];
    for (const el of head.querySelectorAll('*')) {
      // The band is decoration and is MEANT to sit under things.
      if (el.classList.contains('fp-page-head-band') || el.closest('svg')) continue;
      for (const r of textRects(el)) boxes.push({ el, r });
    }
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        // Nesting is not collision: a <b> inside a <p> shares its box by design.
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        // 4px each way: two lines of text 1px apart is kerning, not a defect.
        if (w > 4 && h > 4) {
          collisions.push({
            a: (a.el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30),
            b: (b.el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30),
            over: `${Math.round(w)}x${Math.round(h)}`,
          });
        }
      }
    }
  }

  window.__RESP = {
    total,
    collisions,
    scrollable,
    doc: { content: de.scrollWidth, box: de.clientWidth },
    main: { content: main.scrollWidth, box: main.clientWidth, left: Math.round(main.getBoundingClientRect().left) },
    docOverflows: de.scrollWidth > de.clientWidth + TOL,
    offenders,
    scrollers,
  };
})();
