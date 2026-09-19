/**
 * *** THE REPORTED FIX FOR FINPAL-28 WAS A NO-OP, AND THE REAL ONE HAS A
 * FAILURE MODE NO EXISTING GATE CAN SEE. ***
 *
 * The ticket said the dropdown arrow sat too close to the field's edge and
 * suggested bumping it a few pixels. It cannot be bumped: a native `<select>`
 * draws its arrow in a gutter the browser owns, and `padding-right` moves the
 * TEXT and leaves the arrow where it was. Rendered side by side to confirm —
 * `padding-right: 16px` and `padding-right: 40px` put the arrow on the same
 * pixel.
 *
 * So `finpal-theme.css` suppresses the native control and draws a chevron as
 * a background image, reserving space with `padding-right: 38px` on
 * `select:not([multiple]):not([size])`.
 *
 * *** AND AN INLINE STYLE BEATS THAT RULE AT ANY SPECIFICITY. *** A select
 * that sets its own `padding` overrides the gutter, and its option text runs
 * under the chevron. There is no build error, no type error and no failing
 * test — it simply looks wrong, on whichever screen nobody opened.
 *
 * This file is the list, derived rather than written down. *** IT EXISTS
 * BECAUSE MY OWN HAND-WRITTEN LIST WAS WRONG TWICE: *** the first survey
 * broke on `=>` inside an `onChange` handler and mis-reported which selects
 * carried a class; the second only looked for inline padding on selects
 * WITHOUT `.fp-input`, and missed three that had both. Rendering the pages
 * is what caught it. "A list is a list of the ones somebody remembered" is
 * D-59, and this is the third time it has bitten.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..');

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      tsxFiles(full, out);
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * The end of a JSX opening tag, skipping `{...}` expressions and strings.
 *
 * *** A NAIVE SEARCH FOR THE NEXT `>` STOPS ON THE ARROW IN
 * `onChange={(e) => …}`. *** That is exactly how the first survey of these
 * call sites came out wrong, so the scan is brace-aware.
 */
function tagEnd(src: string, from: number): number {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '"' && depth === 0) i = src.indexOf('"', i + 1);
    else if (c === '>' && depth === 0) return i;
  }
  return src.length;
}

interface Site {
  file: string;
  line: number;
  padding: string;
  hasPaddingRight: boolean;
}

/**
 * *** THE WORSE FAILURE, AND THE ONE NOTHING CAUGHT UNTIL IT WAS RENDERED. ***
 *
 * `background: 'var(--input-bg)'` is the SHORTHAND. It resets every
 * background longhand it does not mention — including `background-image`,
 * which is where the chevron lives. A select styled that way loses the
 * native arrow to `appearance: none` and gains no replacement: **no arrow at
 * all**, which is strictly worse than the arrow being close to the edge.
 *
 * Eight selects and two shared style objects did this. Every one of them
 * type-checked, passed the whole vitest suite, and looked wrong only in a
 * screenshot. `backgroundColor` is the narrow form and does the same job.
 */
function selectsWithBackgroundShorthand(): Array<{ file: string; line: number }> {
  const hits: Array<{ file: string; line: number }> = [];
  for (const file of tsxFiles(SRC)) {
    const src = readFileSync(file, 'utf8');
    let i = src.indexOf('<select');
    while (i !== -1) {
      const blob = src.slice(i, tagEnd(src, i + 7));
      if (/\bbackground:/.test(blob)) {
        hits.push({ file: file.slice(SRC.length + 1), line: src.slice(0, i).split('\n').length });
      }
      i = src.indexOf('<select', i + 7);
    }
  }
  // The shared objects a select spreads in, found by the declaration's NAME
  // for the same reason as above — proximity is not ownership.
  for (const file of tsxFiles(SRC)) {
    const src = readFileSync(file, 'utf8');
    for (const decl of src.matchAll(
      /(?:export )?const \w*[Ss]elect\w*Style\s*:[^=]*=\s*\{([\s\S]*?)\n\};/g,
    )) {
      const m = decl[1].match(/\bbackground:\s*/);
      if (m) {
        hits.push({
          file: file.slice(SRC.length + 1),
          line: src.slice(0, (decl.index ?? 0) + decl[0].indexOf(m[0])).split('\n').length,
        });
      }
    }
  }
  return hits;
}

function selectsWithInlinePadding(): Site[] {
  const sites: Site[] = [];
  for (const file of tsxFiles(SRC)) {
    const src = readFileSync(file, 'utf8');
    let i = src.indexOf('<select');
    while (i !== -1) {
      const blob = src.slice(i, tagEnd(src, i + 7));
      const pad = blob.match(/\bpadding:\s*'([^']+)'/);
      if (pad) {
        sites.push({
          file: file.slice(SRC.length + 1),
          line: src.slice(0, i).split('\n').length,
          padding: pad[1],
          hasPaddingRight: /\bpaddingRight:\s*['\d]/.test(blob),
        });
      }
      i = src.indexOf('<select', i + 7);
    }
    // Style objects a select spreads in are not inside any tag, so they need
    // their own pass.
    //
    // *** SCOPED BY THE DECLARATION'S NAME, NOT BY "a select is mentioned
    // nearby". *** The first version looked 400 characters back for the word
    // "select" and flagged `rowStyle` in Review.tsx, which is a table row and
    // happens to sit nine lines below `selectStyle`. A guard that reports a
    // file which is not wrong teaches people to ignore it.
    for (const decl of src.matchAll(
      /(?:export )?const (\w*[Ss]elect\w*Style)\s*:[^=]*=\s*\{([\s\S]*?)\n\};/g,
    )) {
      const body = decl[2];
      const pad = body.match(/\bpadding:\s*'([^']+)'/);
      if (pad && !/\bpaddingRight\b/.test(body)) {
        sites.push({
          file: file.slice(SRC.length + 1),
          line: src.slice(0, (decl.index ?? 0) + decl[0].indexOf(pad[0])).split('\n').length,
          padding: pad[1],
          hasPaddingRight: false,
        });
      }
    }
    i = -1;
  }
  return sites;
}

describe('the dropdown chevron has room on every select', () => {
  it('finds the call sites at all', () => {
    // A scan that matches nothing passes vacuously, which is how a guard
    // keyed to a spelling goes blind.
    const sites = selectsWithInlinePadding();
    expect(sites.length).toBeGreaterThanOrEqual(10);
  });

  it('no select sets an inline padding without clearing the chevron', () => {
    const offenders = selectsWithInlinePadding()
      .filter((s) => !s.hasPaddingRight)
      .map((s) => `${s.file}:${s.line} sets padding: '${s.padding}' with no paddingRight`);
    expect(offenders).toEqual([]);
  });

  it('no select sets the background SHORTHAND, which erases the chevron', () => {
    // *** THIS IS THE ASSERTION THE PADDING ONE COULD NOT MAKE. *** A select
    // with `background: …` inline has no arrow at all — the native one is
    // suppressed and the replacement is reset away. Eight call sites and two
    // shared style objects were in this state, all type-checking, all passing
    // the suite, visible only in a rendered screenshot.
    const offenders = selectsWithBackgroundShorthand().map(
      (s) => `${s.file}:${s.line} uses the \`background\` shorthand — use backgroundColor`,
    );
    expect(offenders).toEqual([]);
  });

  it('the chevron rule is on the ELEMENT, not on a class', () => {
    // 32 of the app's selects carry `.fp-input` and 16 do not. Scoping the
    // rule to the class would leave two dropdown appearances in one app —
    // D-106's shape, a helper adopted in most places and bypassed in the
    // rest. Keying on the element means a select written tomorrow gets it.
    const css = readFileSync(join(SRC, 'styles', 'finpal-theme.css'), 'utf8');
    expect(css).toMatch(/^select:not\(\[multiple\]\):not\(\[size\]\) \{/m);
    expect(css).not.toMatch(/^\.fp-input:not\(\[multiple\]\)/m);
  });

  it('exempts list boxes, which have no arrow to replace', () => {
    const css = readFileSync(join(SRC, 'styles', 'finpal-theme.css'), 'utf8');
    const rule = css.slice(css.indexOf('select:not([multiple])'));
    expect(rule.slice(0, 60)).toContain(':not([size])');
  });

  it('ships a chevron for both themes', () => {
    // A background image cannot read `currentColor`, so the stroke is spelled
    // out per theme. One without the other is a near-black chevron on a
    // near-black field — D-262's exact shape, one control over.
    const css = readFileSync(join(SRC, 'styles', 'finpal-theme.css'), 'utf8');
    const light = css.match(/^select:not\(\[multiple\]\):not\(\[size\]\) \{[\s\S]*?\n\}/m)?.[0] ?? '';
    const dark = css.match(/^\[data-theme='dark'\] select:not\(\[multiple\]\)[\s\S]*?\n\}/m)?.[0] ?? '';
    expect(light).toContain('background-image');
    expect(dark).toContain('background-image');
    // and they must not be the same colour, or the dark rule is decoration
    const stroke = (s: string) => s.match(/stroke='(%23[0-9A-Fa-f]{6})'/)?.[1];
    expect(stroke(light)).toBeTruthy();
    expect(stroke(dark)).toBeTruthy();
    expect(stroke(light)).not.toBe(stroke(dark));
  });

  it('draws the chevron in the theme\'s own --kt-soft, not a hand-picked grey', () => {
    // The standing rule is measure a colour, never match one. These two hexes
    // are `--kt-soft` in each theme and this is what keeps them that way —
    // a data URI cannot hold a CSS variable, so the copy needs a guard.
    const css = readFileSync(join(SRC, 'styles', 'finpal-theme.css'), 'utf8');
    const ktSoft = [...css.matchAll(/--kt-soft:\s*(#[0-9A-Fa-f]{6})/g)].map((m) =>
      m[1].toLowerCase(),
    );
    expect(ktSoft.length).toBe(2);
    const strokes = [...css.matchAll(/stroke='%23([0-9A-Fa-f]{6})'/g)].map((m) =>
      ('#' + m[1]).toLowerCase(),
    );
    expect(strokes.length).toBeGreaterThanOrEqual(2);
    for (const s of strokes) expect(ktSoft).toContain(s);
  });
});
