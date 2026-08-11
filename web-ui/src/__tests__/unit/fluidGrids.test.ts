/**
 * A SOURCE guard on `gridTemplateColumns`, and it exists because the runtime one
 * cannot see this.
 *
 * `scripts/responsive-walk/run.mjs` measures real layout in a real browser at four
 * widths, which is strictly better evidence — except for one shape. Sabotaging
 * `Accounts.tsx`'s stat row from `repeat(auto-fit, minmax(250px, 1fr))` to
 * `repeat(4, 320px)` produced 62 overflow findings at 1024, 768 and 390 — and
 * ZERO at 1440, because the captured page had few enough cards that the extra
 * tracks were empty. Nothing was cut off, so nothing was measurable. A fixed-track
 * grid that only breaks once a user has more rows than the fixture is invisible to
 * a walk over fixed captures, and it is invisible on the developer's screen too.
 *
 * So: no NEW fixed-track grid in a .tsx file. The exemptions below each carry a
 * reason, and the second test fails if one of them stops being true — otherwise
 * this rots into a place to hide new ones.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.tsx')) out.push(p);
  }
  return out;
};

/**
 * A track list is FLUID if every track can shrink: `1fr`, `auto`, `minmax(…, 1fr)`
 * and `repeat(auto-fit|auto-fill, …)` all can. A fixed length (`340px`) cannot, and
 * `repeat(<number>, 1fr)` cannot either — its track COUNT is fixed even though each
 * track is flexible, which is the shape that squeezes twelve columns into 390px.
 */
const isFluid = (template: string): boolean => {
  if (/repeat\(\s*auto-(fit|fill)/.test(template)) return true;
  if (/repeat\(\s*\d+/.test(template)) return false;
  if (/\d\s*(px|rem|em|ch)\b/.test(template)) return false;
  return true;
};

/**
 * Every exemption, with the reason it is one. Keyed by `file:template` so moving a
 * grid to a new line does not silently re-exempt a different one.
 */
const FIXED_BY_DESIGN: Record<string, string> = {
  // ── Decorative wallpaper: absolutely positioned, pointer-events: none, filled
  // with glyphs at 3–5% opacity. It has no reflow requirement because it carries
  // no content — there is nothing in it to cut off.
  //
  // *** THE DESIGN DOC NAMED ONLY ONE OF THESE, AND IT WAS THE DEAD ONE. *** It
  // exempted `components/layout/Layout.tsx:45` — a file NOTHING IMPORTS — while
  // the four that actually render went unlisted.
  'pages/Login.tsx|repeat(12, 1fr)': 'decorative 96-glyph wallpaper, opacity 0.03, pointer-events none',
  'pages/Register.tsx|repeat(12, 1fr)': 'decorative 96-glyph wallpaper, opacity 0.03, pointer-events none',
  'pages/Landing.tsx|repeat(10, 1fr)': 'decorative 100-glyph wallpaper, opacity 0.05, pointer-events none',
  'pages/Onboarding.tsx|repeat(8, 1fr)': 'decorative 64-glyph wallpaper, opacity 0.05, pointer-events none',
  'components/layout/Layout.tsx|repeat(12, minmax(0, 1fr))':
    'decorative 144-glyph wallpaper — and the file is DEAD, imported by nothing; App.tsx is the real shell',

  // ── Tier 3: a data table, kept fixed and made scrollable instead. Reflowing it
  // destroys the column-to-header relationship that makes it readable.
  //
  // Tier 2's three two-pane layouts need no entry here: their templates moved OUT
  // of the .tsx files entirely, into `.fp-two-pane` in finpal-theme.css, because an
  // inline style cannot carry the media query that stacks them — and out-specifies
  // one, so the stacking would silently never apply.
  'modules/pointspal/pages/MyCards.tsx|130px 52px 90px 90px 52px':
    'Tier 3 — a data table; scrolls horizontally inside .fp-table-scroll rather than reflowing',
};

const collect = () => {
  const found: { key: string; file: string; template: string }[] = [];
  for (const file of walk(SRC)) {
    const rel = file.slice(SRC.length + 1);
    const body = readFileSync(file, 'utf8');
    for (const m of body.matchAll(/gridTemplateColumns:\s*'([^']+)'/g)) {
      const template = m[1];
      if (isFluid(template)) continue;
      found.push({ key: `${rel}|${template}`, file: rel, template });
    }
  }
  return found;
};

describe('grids are intrinsically fluid, or exempt for a stated reason', () => {
  it('finds a non-trivial number of grids, or the scan is broken', () => {
    // A regex that matched nothing would make the assertion below vacuous — which
    // is the failure mode this repo names D-45, and it has shipped it more than
    // once. 49 grids were counted by hand on 2026-08-11.
    const all = walk(SRC).flatMap((f) => [
      ...readFileSync(f, 'utf8').matchAll(/gridTemplateColumns:\s*'([^']+)'/g),
    ]);
    expect(all.length).toBeGreaterThan(40);
  });

  it('no fixed-track grid outside the exemption list', () => {
    const offenders = collect().filter((g) => !(g.key in FIXED_BY_DESIGN));
    expect(
      offenders.map((o) => o.key),
      'these grids have a fixed track count or a fixed length, so they cannot reflow. '
      + 'Prefer repeat(auto-fit, minmax(<floor>, 1fr)), which works in an inline style '
      + 'and needs no media query. If the grid genuinely must stay fixed, give it a '
      + 'horizontal scroll container and add it to FIXED_BY_DESIGN with the reason.',
    ).toEqual([]);
  });

  it('the exemption list is not stale', () => {
    // The other half of the contract. Without it an exemption survives the grid it
    // was written for, and the next fixed-track grid at that path inherits a reason
    // that was never about it.
    const present = new Set(collect().map((g) => g.key));
    const dead = Object.keys(FIXED_BY_DESIGN).filter((k) => !present.has(k));
    expect(
      dead,
      'these entries no longer match any grid in the source — delete them rather than '
      + 'leaving an exemption looking for something to excuse',
    ).toEqual([]);
  });
});
