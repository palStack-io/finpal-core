/**
 * Runs INSIDE the page. Reports overflow within an OPEN MODAL, at whatever
 * viewport CDP has emulated.
 *
 * *** WHY THIS IS NOT `responsive-walk/measure.js` WITH A DIFFERENT ROOT. ***
 *
 * That script measures everything against `.main-content`'s right edge, which is
 * correct for page content and wrong for a modal in two ways that both read as
 * "clean":
 *
 *   1. A modal is `position: fixed`. It does not contribute to
 *      `documentElement.scrollWidth`, so the document-level check is blind to it
 *      BY CONSTRUCTION — no matter how far it overhangs.
 *   2. `.main-content` is inset by the 240px sidebar above 767px. A fixed overlay
 *      spanning the viewport is not "overhanging" by 240px; it is doing its job.
 *      Measured against `mainRight` it produces a finding at 1440/1024/768 and
 *      none at 390 — the exact inverse of the truth.
 *
 * So the reference edge here is the VIEWPORT, and the root is the modal.
 */
(() => {
  const TOL = 1;

  const modal = document.querySelector('[data-fp-modal]');
  if (!modal) {
    window.__MODAL = { error: 'no [data-fp-modal] in the capture — the modal root was never marked' };
    return;
  }
  const vw = document.documentElement.clientWidth;

  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n !== modal && parts.length < 12; n = n.parentElement) {
      const i = n.parentElement ? [...n.parentElement.children].indexOf(n) : 0;
      parts.unshift(`${n.tagName.toLowerCase()}:${i}`);
    }
    return parts.join('>') || ':root';
  };
  const label = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34);

  const scrollsX = (el) => {
    const ox = getComputedStyle(el).overflowX;
    return ox === 'auto' || ox === 'scroll';
  };

  const offenders = [];
  const scrollers = [];
  const tables = [];
  let total = 0;

  const all = [modal, ...modal.querySelectorAll('*')];
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    // The visually-hidden idiom, skipped for the reason responsive-walk records:
    // a 1x1 clipped box holding real text reports as massively clipped forever.
    const clipped0 = cs.clip.replace(/[\s,]/g, '') === 'rect(0px0px0px0px)';
    if (clipped0 || (r.width <= 1 && r.height <= 1)) continue;

    total += 1;

    /**
     * Every horizontal scroller is recorded, INCLUDING the modal's own card.
     * That is the point of this walk. `responsive-walk/run.mjs` records the trap
     * in its own words — MyCards' 438px earn-rate grid was reachable only because
     * "the modal above it computes `overflow-x: auto` as a side effect of its own
     * `overflow-y` — by accident, at the wrong scroll container". A gate that only
     * asks "did anything scroll?" passes that. So this asks WHICH element scrolls,
     * and `run.mjs` decides whether that element was meant to.
     */
    if (scrollsX(el) && el.scrollWidth - el.clientWidth > TOL) {
      /**
       * *** WHAT THE BOX CONTAINS, NOT WHAT HAPPENS TO BE NESTED SOMEWHERE IN IT. ***
       *
       * "Is this scroller the nearest scrollable ancestor of a wide table?" was
       * the first rule here and it is worthless: delete the preview table's own
       * wrapper and the modal's card becomes that ancestor and inherits the
       * excuse — the sabotage passed. "Does a wide table hang out of it?" fails
       * the same way for the same reason, one level deeper.
       *
       * So the shape is recorded instead: the in-flow children, whatever they are.
       * The app's own Tier 3 idiom is `.fp-table-scroll > table` — a box whose
       * entire content is one table — and `run.mjs` accepts exactly that.
       */
      const kids = [];
      for (const child of el.children) {
        const ccs = getComputedStyle(child);
        if (ccs.position === 'absolute' || ccs.position === 'fixed' || ccs.display === 'none') continue;
        kids.push(child.tagName.toLowerCase());
      }
      scrollers.push({
        path: pathOf(el), tag: el.tagName.toLowerCase(),
        content: Math.round(el.scrollWidth), box: Math.round(el.clientWidth),
        overflowY: cs.overflowY, kids, text: label(el),
      });
    }

    if (el.tagName === 'TABLE') {
      /**
       * The nearest ancestor that can actually scroll this table into view — and
       * `overflow-x: hidden` ENDS the search rather than being stepped over. A
       * clipper between the table and a scrollable ancestor means the scroll
       * happens outside the cut, so the columns past the cut are gone whatever the
       * outer box does. Written the other way first, and it let the sabotage that
       * turns the preview wrapper into a clipper report only the box, never the
       * table.
       */
      let host = null;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const pox = getComputedStyle(p).overflowX;
        if (pox === 'hidden' || pox === 'clip') break;
        if (scrollsX(p)) { host = p; break; }
        if (p === modal) break;
      }
      // Header cells if there are any, otherwise the first row's — not both, which
      // is what `'thead th, tr:first-child > *'` counted, reporting a five-column
      // table as ten.
      const cols = (el.querySelectorAll('thead th').length
        || el.querySelector('tr')?.children.length || 0);
      tables.push({
        path: pathOf(el),
        width: Math.round(r.width),
        intrinsic: Math.round(el.scrollWidth),
        cols,
        hostPath: host ? pathOf(host) : null,
        hostBox: host ? Math.round(host.clientWidth) : null,
        hostContent: host ? Math.round(host.scrollWidth) : null,
      });
    }

    if (scrollsX(el)) continue; // its own overflow is reachable; judged by run.mjs

    const kinds = [];

    // Clipped, from IN-FLOW children only — an absolutely positioned decoration
    // placed outside its parent is not lost content. Same reasoning, and the same
    // false positive (a glow orb), as responsive-walk records.
    let inflowRight = 0;
    for (const child of el.children) {
      const ccs = getComputedStyle(child);
      if (ccs.position === 'absolute' || ccs.position === 'fixed') continue;
      if (ccs.display === 'none') continue;
      inflowRight = Math.max(inflowRight, child.getBoundingClientRect().right);
    }
    if (cs.overflowX === 'hidden' && inflowRight > r.right + TOL) kinds.push('clipped');

    // Overhang, against the VIEWPORT. Skipped when something between here and the
    // modal root already clips or scrolls: containment is transitive, and without
    // this the gate reports one overflow once per descendant.
    let bounded = false;
    for (let p = el.parentElement; p && p !== modal; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== 'visible') { bounded = true; break; }
    }
    if (!bounded && (r.right > vw + TOL || r.left < -TOL)) kinds.push('overhang');

    if (!kinds.length) continue;
    offenders.push({
      path: pathOf(el), kinds, tag: el.tagName.toLowerCase(),
      grid: cs.display.includes('grid') ? cs.gridTemplateColumns.slice(0, 80) : '',
      content: Math.round(el.scrollWidth), box: Math.round(el.clientWidth),
      over: Math.round(Math.max(el.scrollWidth - el.clientWidth, r.right - vw, -r.left)),
      text: label(el),
    });
  }

  const mr = modal.getBoundingClientRect();
  /**
   * *** A SECOND STUB SIGNAL, BECAUSE PROSE IS FEW ELEMENTS AND LOTS OF TEXT.
   * *** `total` alone reads a fully-rendered lesson reader -- a heading, four
   * paragraphs and an aside, 1,374 characters of approved copy -- as a stub at
   * 17 elements, while a form half that long passes at 30. Element count
   * answers "how much structure is there", not "did the content render", and
   * the panel this walk exists to measure is the case where those two diverge.
   */
  const chars = (modal.textContent || '').replace(/\s+/g, ' ').trim().length;
  window.__MODAL = {
    total, chars, vw,
    name: modal.getAttribute('data-fp-modal'),
    root: { left: Math.round(mr.left), right: Math.round(mr.right), width: Math.round(mr.width) },
    offenders, scrollers, tables,
  };
})();
