/**
 * THE CONTRAST GATE — the check this project was missing.
 *
 * Two colours in an OWNER-APPROVED palette failed WCAG AA, on the figures that
 * matter most (the overspend amount, the second member's name), and nothing
 * anywhere could see it. Review by eye passed them twice. A gate that computes
 * ratios would have caught both the first time.
 *
 * SO THIS FILE COMPUTES, IT DOES NOT COMPARE AGAINST KNOWN-GOOD HEXES. Pinning
 * the seven values that happen to be correct today would pass forever and say
 * nothing about the eighth token someone adds next month.
 *
 * ── The mechanism, which is the part that matters ────────────────────────────
 *
 * The manual sweep was run TWICE and the second pass found three failures the
 * first missed — for the reason a hand-written pair list always fails: the first
 * pass checked text against `card` and `wash` and stopped, while the segmented
 * controls put `soft` on two further backgrounds nobody had listed. On one of
 * them the FIRST CORRECTION still failed, at 3.98:1. "A list is a list of the
 * ones somebody remembered" is D-59 wearing a different hat.
 *
 * The defence here is enforced completeness, in both directions:
 *
 *   1. every `--kt-*` colour token parsed out of the CSS must appear in ROLES,
 *      and every ROLES entry must exist in the CSS — so a NEW TOKEN cannot land
 *      unclassified and silently unchecked;
 *   2. every paint token must state a verdict for EVERY declared surface — so a
 *      NEW SURFACE invalidates all of them at once, which is precisely the
 *      failure that happened by hand;
 *   3. the two themes must declare the SAME token set — a token missing from
 *      dark does not degrade, it inherits light's value.
 *
 * A verdict of `absent:` or `decorative:` is the escape hatch, so it costs
 * something: each must carry its reason inline, and the totals are pinned below.
 * Silencing this gate is possible, but only as a visible diff.
 *
 * ── WHAT THIS FILE CANNOT SEE, AND IT IS HALF THE JOB ───────────────────────
 *
 * PAINT below is a CONTRACT about which paints occur on which surfaces. Nothing
 * here checks that the contract is TRUE, and nothing can while no component
 * references a token. Concretely: a slice-3 element that sets
 * `color: var(--kt-green)` on a wash-backed surface is 4.39:1 — a real AA
 * failure, the exact thing this slice exists to prevent — and this file stays
 * GREEN, because green-on-wash is classified 'object' and 4.39 clears the 3.0
 * non-text floor. The same hole covers every 'absent' verdict.
 *
 * Closing it needs the other half the plan describes: resolve each element's own
 * colour against its ACTUAL COMPUTED BACKGROUND in a rendered page, walking up
 * the tree for transparent backgrounds. THAT IS AN OPEN OBLIGATION ON SLICE 3,
 * where there is finally a rendered page to walk. Until then, "the contrast gate
 * shipped" means the palette is sound, NOT that its use is.
 *
 * Watched failing before being believed — see the checkpoint in ROADMAP.md for
 * the three sabotages and their output.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(
  resolve(process.cwd(), 'src/styles/finpal-theme.css'), 'utf8');

// ─── parsing ────────────────────────────────────────────────────────────────

/** The declarations inside `selector { ... }`, comments stripped. */
function block(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, `${selector} is not defined`).toBeGreaterThan(-1);
  const open = css.indexOf('{', at);
  const body = css.slice(open + 1, css.indexOf('\n}', open));
  return body.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every `--kt-*` custom property declared in a block, in source order. */
function tokensIn(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block(selector).split(';')) {
    const m = line.match(/(--kt-[a-z0-9-]+)\s*:\s*(\S+)/i);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const LIGHT = tokensIn(':root');
const DARK = tokensIn('[data-theme="dark"]');

/** Tokens that are legitimately not colours. Anything else must be a hex, or
 *  the classification below cannot see it — a token written `rgb(200,0,0)`
 *  would otherwise slip past every check in this file. */
const NON_COLOUR = new Set(['--kt-radius']);

// ─── the classification. THIS IS THE CONTRACT, and it must be total ─────────
//
// verdicts:
//   'text'         the token paints TEXT on that surface        -> needs 4.5:1
//   'object'       a fill, dot, ring or bar segment there       -> needs 3.0:1
//   'absent: why'  it never occurs there, and why it must not
//   'decorative: why'  it occurs but carries no information (WCAG 1.4.11 covers
//                  objects *required to understand the content*)

const SURFACES = [
  '--kt-wash', '--kt-card', '--kt-hover', '--kt-line-track', '--kt-axis-track',
] as const;

type Surface = (typeof SURFACES)[number];
type Verdict = string;

const PAINT: Record<string, Record<Surface, Verdict>> = {
  '--kt-ink': {
    '--kt-wash': 'text', '--kt-card': 'text', '--kt-hover': 'text',
    '--kt-line-track': 'text', '--kt-axis-track': 'text',
  },
  '--kt-soft': {
    // The token corrected TWICE. The line-track and axis-track columns are the
    // two surfaces the first hand sweep never listed; they are why it exists.
    '--kt-wash': 'text', '--kt-card': 'text', '--kt-hover': 'text',
    '--kt-line-track': 'text', '--kt-axis-track': 'text',
  },
  '--kt-green': {
    // THE LAYOUT RULE, expressed as a verdict rather than as prose: the brand
    // green is fixed by decision and is 4.39:1 on the wash, so it may not paint
    // TEXT there — as a button fill or a focus ring (non-text, 3:1) it is legal.
    '--kt-card': 'text', '--kt-hover': 'text',
    '--kt-wash': 'object', '--kt-line-track': 'object', '--kt-axis-track': 'object',
  },
  '--kt-clay': {
    '--kt-wash': 'text', '--kt-card': 'text', '--kt-hover': 'text',
    '--kt-line-track': 'absent: clay marks an amount or a member, never a control label',
    '--kt-axis-track': 'absent: clay marks an amount or a member, never a control label',
  },
  '--kt-line': {
    '--kt-wash': 'decorative: a hairline separating rows carries no information the row does not',
    '--kt-card': 'decorative: a hairline separating rows carries no information the row does not',
    '--kt-hover': 'decorative: a hairline separating rows carries no information the row does not',
    '--kt-line-track': 'absent: the track IS this paint; nothing draws a hairline on it',
    '--kt-axis-track': 'absent: nothing draws a hairline on the pill track',
  },
  ...Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`--kt-seg-${n}`, {
    // The bar and its 10px legend dots live INSIDE a card, and the segments
    // always sum to 100% (checked in kitchen-table-states.html), so the bar's
    // own remainder track is never visible behind them. See the checkpoint for
    // the two adjacency findings this does NOT gate.
    '--kt-card': 'object',
    '--kt-wash': 'absent: the share bar and its legend live inside a card',
    '--kt-hover': 'absent: the share bar and its legend live inside a card',
    '--kt-line-track': 'absent: the share bar and its legend live inside a card',
    '--kt-axis-track': 'absent: segments sum to 100%, so the remainder track never shows behind one',
  }])),
};

/** Pinned so that silencing a pair is a visible diff, never a quiet one. */
const PINNED_ABSENT = 24;
const PINNED_DECORATIVE = 3;

// ─── WCAG 2.1 relative luminance and contrast ratio ─────────────────────────

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The worked example from WCAG's own definition: black on white is 21:1. */
describe('the ratio computation itself', () => {
  it('gives 21:1 for black on white and 1:1 for a colour on itself', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(ratio('#AB5437', '#AB5437')).toBeCloseTo(1, 5);
  });

  it('reproduces the measurement that condemned the approved clay', () => {
    // #C2603F on card was 4.05:1 — the number that started all of this.
    expect(ratio('#C2603F', '#FBFCF9')).toBeCloseTo(4.05, 2);
  });
});

// ─── completeness: nothing may be unclassified, in either direction ─────────

describe('every token is classified, and every classification is a token', () => {
  it('declares the same COLOUR token set in light and in dark', () => {
    // A colour missing from dark does not degrade — it inherits light's value,
    // i.e. a near-white pill sitting on a green-black page. Geometry is
    // theme-independent and is declared once, in :root, so it is excluded
    // rather than duplicated; NON_COLOUR is what makes that exclusion explicit.
    const colours = (t: Record<string, string>) =>
      Object.keys(t).filter((n) => !NON_COLOUR.has(n)).sort();
    expect(colours(DARK)).toEqual(colours(LIGHT));
    for (const name of NON_COLOUR) expect(DARK[name]).toBeUndefined();
  });

  it('finds the palette at all', () => {
    // Guards against the parser silently matching nothing, which would make
    // every loop below vacuous — a check that inspects nothing looks exactly
    // like a check that passes.
    expect(Object.keys(LIGHT).length).toBeGreaterThanOrEqual(16);
  });

  it('has every --kt- token be a hex colour or a declared non-colour', () => {
    for (const [name, value] of Object.entries(LIGHT)) {
      if (NON_COLOUR.has(name)) continue;
      expect(value, `${name} is not a 6-digit hex and is not declared NON_COLOUR`)
        .toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('classifies every colour token as a surface or a paint', () => {
    for (const name of Object.keys(LIGHT)) {
      if (NON_COLOUR.has(name)) continue;
      const known = (SURFACES as readonly string[]).includes(name) || name in PAINT;
      expect(known, `${name} is declared in the CSS but classified nowhere in `
        + 'this file, so no contrast check can see it').toBe(true);
    }
  });

  it('classifies nothing that the CSS does not declare', () => {
    for (const name of [...SURFACES, ...Object.keys(PAINT)]) {
      expect(name in LIGHT, `${name} is classified here but declared in no theme`)
        .toBe(true);
    }
  });

  it('makes every paint state a verdict for every surface', () => {
    // THE LOAD-BEARING ASSERTION. Adding a surface to the CSS breaks every
    // paint token at once — which is exactly the failure that happened by hand,
    // where `soft` was signed off against two of its four backgrounds.
    for (const [paint, verdicts] of Object.entries(PAINT)) {
      expect(Object.keys(verdicts).sort(), `${paint} does not cover every surface`)
        .toEqual([...SURFACES].sort());
    }
  });

  it('pins how many pairs are excused, so silencing one shows up in a diff', () => {
    const all = Object.values(PAINT).flatMap((v) => Object.values(v));
    expect(all.filter((v) => v.startsWith('absent')).length).toBe(PINNED_ABSENT);
    expect(all.filter((v) => v.startsWith('decorative')).length).toBe(PINNED_DECORATIVE);
  });

  it('makes every excused pair carry its reason', () => {
    for (const [paint, verdicts] of Object.entries(PAINT)) {
      for (const [surface, verdict] of Object.entries(verdicts)) {
        if (verdict === 'text' || verdict === 'object') continue;
        expect(verdict, `${paint} on ${surface} is excused without a reason`)
          .toMatch(/^(absent|decorative): \S.{10,}/);
      }
    }
  });
});

// ─── the ratios themselves, in both palettes ────────────────────────────────

describe.each([['light', LIGHT], ['dark', DARK]] as const)(
  'contrast — %s', (theme, tokens) => {
    for (const [paint, verdicts] of Object.entries(PAINT)) {
      for (const surface of SURFACES) {
        const verdict = verdicts[surface];
        if (verdict !== 'text' && verdict !== 'object') continue;
        const floor = verdict === 'text' ? 4.5 : 3.0;

        it(`${paint} as ${verdict} on ${surface} clears ${floor}:1`, () => {
          const fg = tokens[paint];
          const bg = tokens[surface];
          expect(fg, `${paint} missing in ${theme}`).toBeDefined();
          expect(bg, `${surface} missing in ${theme}`).toBeDefined();
          const r = ratio(fg, bg);
          expect(
            r,
            `${paint} (${fg}) on ${surface} (${bg}) is ${r.toFixed(2)}:1 in `
            + `${theme}, below the ${floor}:1 WCAG 2.1 floor for `
            + `${verdict === 'text' ? 'body text (1.4.3)' : 'non-text (1.4.11)'}`,
          ).toBeGreaterThanOrEqual(floor);
        });
      }
    }
  },
);

// ─── reconciliation, not assumption ─────────────────────────────────────────

describe('the palette agrees with what the app already declares', () => {
  it('keeps --kt-green identical to the brand green in light', () => {
    // The direction says the brand is UNCHANGED. If someone edits one of these
    // two, the redesign and the brand quietly disagree — and the failure would
    // be a slightly-off green nobody can name, not a broken build.
    const brand = block(':root').match(/--brand-main-green\s*:\s*(\S+?);/i);
    expect(brand, '--brand-main-green is not declared').not.toBeNull();
    expect(LIGHT['--kt-green'].toLowerCase()).toBe(brand![1].toLowerCase());
  });

  it('keeps the light hairline and the light control track one paint', () => {
    // Two roles, one colour — declared separately so the gate can check `soft`
    // against the track as a SURFACE, and pinned here so the duplication stays
    // deliberate rather than drifting into two near-identical greys.
    expect(LIGHT['--kt-line']).toBe(LIGHT['--kt-line-track']);
  });

  it('records that DARK deliberately splits them, which light does not', () => {
    // Asserting the light identity in dark too was the first thing this file
    // caught, and it was catching a real asymmetry rather than a typo: dark's
    // segmented control track in kitchen-table-transactions.html is a literal
    // #1E3024, NOT `var(--line)` (#27382C) the way light's is. Both are
    // approved values, so this is not a defect — but it means "the track is
    // the hairline colour" is a LIGHT-ONLY fact, and slice 3 must not port it
    // to dark by assuming symmetry.
    expect(DARK['--kt-line']).not.toBe(DARK['--kt-line-track']);
  });

  it('keeps the container radius at the measured 22px', () => {
    // The radius belongs to the CONTAINER, not the row: that is the move that
    // takes a real 50-row page from 4404px to 3875px. Changing this is a design
    // decision, so it should fail here and be updated deliberately.
    expect(LIGHT['--kt-radius']).toBe('22px');
  });
});
