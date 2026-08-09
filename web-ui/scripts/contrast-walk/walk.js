/**
 * THE OTHER HALF OF THE CONTRAST GATE — the half tokenContrast.test.ts cannot do.
 *
 * #102 validates the PALETTE: it proves the declared token pairs clear AA. It
 * cannot see USAGE, so `color: var(--kt-green)` on a wash-backed element is
 * 4.39:1 — a real AA failure — and that gate stays green, because green-on-wash
 * is classified an 'object' and 4.39 clears the 3.0 non-text floor.
 *
 * This walks a RENDERED tree instead. For every element carrying text it resolves
 * the element's own computed colour against its ACTUAL computed background,
 * climbing ancestors when a background is transparent, and reports the ratio.
 * Enumerated FROM THE TREE, never from a list of pairs somebody thought of —
 * that is D-59 in another costume, and it has bitten this palette twice.
 *
 * Injected into a page by headless Chrome; writes its findings into a <pre> that
 * --dump-dom reads back.
 */
(function () {
  const AA_TEXT = 4.5;
  const AA_LARGE = 3.0;   // >=24px, or >=18.66px when bold
  const AA_NONTEXT = 3.0;

  function parseColor(str) {
    const m = String(str).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    const [r, g, b] = parts;
    const a = parts.length > 3 ? parts[3] : 1;
    return { r, g, b, a };
  }

  function relLuminance({ r, g, b }) {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }

  function ratio(fg, bg) {
    const a = relLuminance(fg) + 0.05;
    const b = relLuminance(bg) + 0.05;
    return a > b ? a / b : b / a;
  }

  /** Composite a partially transparent colour over what is behind it. */
  function over(top, bottom) {
    if (top.a >= 1) return { r: top.r, g: top.g, b: top.b, a: 1 };
    return {
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
      a: 1,
    };
  }

  /**
   * The actual background behind an element. THIS is the part a pair-list gets
   * wrong: a row's own background is usually transparent, so the colour the eye
   * sees comes from an ancestor several levels up, and which ancestor depends on
   * the page — not on what the token table says the element "sits on".
   */
  function effectiveBackground(el) {
    const stack = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      // A GRADIENT IS A BACKGROUND. `background-color` is `transparent` on an
      // element painted by `background-image`, so climbing past it reported the
      // page behind the button — which is how "white on white, 1:1" appeared for
      // the green Add Transaction button. Taking the gradient's first colour
      // stop is an approximation, and it is the honest one: it is the colour
      // actually under the label's left edge, and it errs toward the lighter end
      // of this app's gradients rather than flattering them.
      const image = cs.backgroundImage;
      if (image && image !== 'none') {
        const stop = image.match(/rgba?\([^)]+\)/);
        if (stop) {
          const c = parseColor(stop[0]);
          if (c && c.a > 0) {
            stack.push(c);
            if (c.a >= 1) { node = null; break; }
          }
        }
      }
      const bg = parseColor(cs.backgroundColor);
      if (bg && bg.a > 0) {
        stack.push(bg);
        if (bg.a >= 1) break;
      }
      node = node.parentElement;
    }
    // Anything still translucent at the top composites onto the canvas.
    let result = { r: 255, g: 255, b: 255, a: 1 };
    const htmlBg = parseColor(getComputedStyle(document.documentElement).backgroundColor);
    if (htmlBg && htmlBg.a >= 1) result = htmlBg;
    for (let i = stack.length - 1; i >= 0; i--) result = over(stack[i], result);
    return result;
  }

  function hasOwnText(el) {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim().length) return true;
    }
    return false;
  }

  function isVisible(el, cs) {
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    // opacity:0 is how this design hides row actions until hover. They ARE shown,
    // so they are checked — reporting them as absent would be the affordance
    // that lies.
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function toHex(c) {
    const h = (v) => Math.round(v).toString(16).padStart(2, '0');
    return '#' + h(c.r) + h(c.g) + h(c.b);
  }

  const findings = [];
  const all = document.querySelectorAll('*');
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (!isVisible(el, cs)) continue;

    const size = parseFloat(cs.fontSize) || 16;
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);

    if (hasOwnText(el)) {
      const fg = parseColor(cs.color);
      if (!fg || fg.a === 0) continue;
      const bg = effectiveBackground(el);
      const composited = over(fg, bg);
      const r = ratio(composited, bg);
      const floor = large ? AA_LARGE : AA_TEXT;
      findings.push({
        kind: 'text',
        sel: describe(el),
        text: el.textContent.trim().slice(0, 40),
        fg: toHex(composited), bg: toHex(bg),
        size, weight, large,
        ratio: Math.round(r * 100) / 100,
        floor,
        pass: r >= floor,
      });
    }

    // Non-text: an SVG icon or a bordered/filled shape carrying meaning.
    if (el.tagName === 'svg' || el.tagName === 'SVG') {
      const stroke = parseColor(cs.color);
      if (stroke && stroke.a > 0) {
        const bg = effectiveBackground(el);
        const r = ratio(over(stroke, bg), bg);
        findings.push({
          kind: 'icon', sel: describe(el), text: '',
          fg: toHex(over(stroke, bg)), bg: toHex(bg),
          size, weight, large: false,
          ratio: Math.round(r * 100) / 100,
          floor: AA_NONTEXT, pass: r >= AA_NONTEXT,
        });
      }
    }
  }

  function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      s += '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.');
    }
    return s;
  }

  const pre = document.createElement('pre');
  pre.id = 'contrast-walk-out';
  pre.textContent = 'WALK::' + JSON.stringify({
    total: findings.length,
    failures: findings.filter((f) => !f.pass),
    worstText: findings.filter((f) => f.kind === 'text')
      .sort((a, b) => a.ratio - b.ratio).slice(0, 5),
  }) + '::END';
  document.body.appendChild(pre);
})();
