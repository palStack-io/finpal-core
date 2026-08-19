/**
 * finPal's dark theme is green-black, and every SURFACE in it must be.
 *
 * The reported symptom: in dark mode the page read navy while the cards read
 * green-black, so the app looked like two designs stacked on each other. The cause was
 * that `[data-theme="dark"] body` hardcoded `#0f172a` — slate-900, a leftover from
 * before the palette went green — while `--bg-card` resolved through
 * `--kt-card: #16241A`. Same for the pointsPal module's own surface tokens: `--bg` was
 * `#0f172a` and `--white` was `#1e293b`, so a pointsPal card sat navy-on-navy inside a
 * green-black shell.
 *
 * WHY THIS IS A COMPUTED CHECK AND NOT A LIST OF BANNED HEXES.
 *
 * `tokenContrast.test.ts` already enforces completeness across the `--kt-*` tokens, and
 * it is a good gate — but every colour above was invisible to it, because none of them
 * is spelled `--kt-`. A gate keyed to a spelling only sees the spellings someone
 * remembered. So this measures HUE: a dark surface may be any green-black, grey or
 * near-black the designer likes, and may not be blue. A future `#101828` is caught
 * without editing this file, which a `not.toContain('#0f172a')` would not be.
 *
 * Greys are allowed on purpose — an achromatic surface is a legitimate choice and has no
 * hue to be wrong about. The defect being pinned is specifically a *chromatic blue*
 * surface in a green palette.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const CSS = readFileSync(
  join(process.cwd(), 'src/styles/finpal-theme.css'),
  'utf8',
);

/**
 * Custom properties that paint a SURFACE — something a user reads text on top of.
 * Text, border and hover tokens are deliberately out of scope: a slate-grey border or
 * a neutral muted text colour is a defensible choice, whereas a blue page behind
 * green-black cards is the reported bug.
 */
const SURFACE_TOKENS = [
  '--bg-primary',
  '--bg-secondary',
  '--bg-card',
  '--bg',          // pointsPal module: the page
  '--white',       // pointsPal module: the card
  '--tooltip-bg',
  '--chart-bg',
  '--input-bg',
  '--input-bg-focus',
];

/** Hues that read as blue/indigo. Green-blacks land around 100–160. */
const BLUE_MIN = 180;
const BLUE_MAX = 280;
/** Below this an rgb triple is effectively grey and its hue is meaningless. */
const CHROMA_FLOOR = 0.06;

function parseColor(value: string): { r: number; g: number; b: number } | null {
  const hex = value.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
    };
  }
  const rgb = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return {
      r: Number(rgb[1]) / 255,
      g: Number(rgb[2]) / 255,
      b: Number(rgb[3]) / 255,
    };
  }
  return null;
}

/** Hue in degrees, plus chroma (max-min) so greys can be excused. */
function hueOf(c: { r: number; g: number; b: number }) {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const chroma = max - min;
  if (chroma === 0) return { hue: 0, chroma };
  let hue: number;
  if (max === c.r) hue = ((c.g - c.b) / chroma) % 6;
  else if (max === c.g) hue = (c.b - c.r) / chroma + 2;
  else hue = (c.r - c.g) / chroma + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { hue, chroma };
}

/** The body of the `[data-theme="dark"] { … }` custom-property block. */
function darkBlock(): string {
  const i = CSS.indexOf('[data-theme="dark"] {');
  expect(i, 'no [data-theme="dark"] block in finpal-theme.css').toBeGreaterThan(-1);
  const open = CSS.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < CSS.length; j++) {
    if (CSS[j] === '{') depth++;
    else if (CSS[j] === '}') {
      depth--;
      if (depth === 0) return CSS.slice(open + 1, j);
    }
  }
  throw new Error('unterminated [data-theme="dark"] block');
}

/** Last declaration of `token` inside the dark block — later wins in CSS. */
function darkValueOf(token: string): string | null {
  const decls = [...darkBlock().matchAll(
    new RegExp(`(?:^|[;\\s])${token}\\s*:\\s*([^;]+);`, 'g'),
  )];
  return decls.length ? decls[decls.length - 1][1].trim() : null;
}

/** Resolve `var(--x)` chains against the dark block, then the `:root` defaults. */
function resolve(value: string, depth = 0): string {
  if (depth > 6) return value;
  const ref = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (!ref) return value;
  const token = ref[1];
  const inDark = darkValueOf(token);
  if (inDark) return resolve(inDark, depth + 1);
  const rootDecls = [...CSS.matchAll(
    new RegExp(`(?:^|[;\\s])${token}\\s*:\\s*([^;]+);`, 'g'),
  )];
  if (!rootDecls.length) return value;
  return resolve(rootDecls[0][1].trim(), depth + 1);
}

describe('the dark theme has surfaces to check', () => {
  it('declares a dark block containing surface tokens', () => {
    const declared = SURFACE_TOKENS.filter((t) => darkValueOf(t) !== null);
    // Not all of them have to be overridden in dark, but if none are, this whole file
    // is passing by finding nothing — the failure mode the contrast gate warns about.
    expect(declared.length).toBeGreaterThanOrEqual(5);
  });
});

describe('no dark surface is blue', () => {
  it.each(SURFACE_TOKENS)('%s', (token) => {
    const raw = darkValueOf(token);
    if (raw === null) return; // not overridden in dark; light's value is checked elsewhere

    const colour = parseColor(resolve(raw));
    expect(colour, `${token}: could not parse ${raw}`).not.toBeNull();

    const { hue, chroma } = hueOf(colour!);
    if (chroma < CHROMA_FLOOR) return; // achromatic — no hue to be wrong about

    expect(
      hue > BLUE_MIN && hue < BLUE_MAX,
      `${token} resolves to ${resolve(raw)} — hue ${hue.toFixed(0)}°, a blue surface in `
      + 'a green-black palette. finPal dark is green-black; use the --kt-* surfaces '
      + '(--kt-wash for a page, --kt-card for a card) rather than a slate literal.',
    ).toBe(false);
  });
});

describe('the dark page background comes from the palette', () => {
  it('[data-theme="dark"] body paints --kt-wash', () => {
    const rule = CSS.match(/\[data-theme="dark"\]\s+body\s*\{([^}]*)\}/);
    expect(rule, 'no [data-theme="dark"] body rule').not.toBeNull();

    const background = rule![1].match(/background\s*:\s*([^;]+);/);
    expect(background, 'dark body sets no background').not.toBeNull();

    // Pinned to the token, not to a hex: the page and the cards must move together,
    // and that only holds if the page names the same palette the cards resolve through.
    expect(background![1].trim()).toContain('--kt-wash');
  });
});
