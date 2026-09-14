/**
 * The onboarding shell is a FIXED dark gradient in both themes, so every colour
 * on it must be measured against that — not taken from the theme. D-212.
 *
 * *** THE DEFECT THIS EXISTS FOR: *** thirteen places in `Onboarding.tsx` read
 * `var(--text-muted)` on a card painted `rgba(30,41,59,0.8)` over
 * `#0f172a → #1e293b`. In dark that token is `#9CB3A3` (6.87:1); **in light it
 * is `#56685D` — 2.59:1, a WCAG failure on the first screen a new user sees.**
 * `var(--text-primary)` would have been 1.08:1; nothing used it, which is the
 * only reason this was hard-to-read rather than invisible.
 *
 * *** AND WHY NO GATE SAW IT: THE ONBOARDING PAGE IS NOT IN THE CONTRAST WALK.
 * *** The walk captures 21 routes; this one needs an authenticated user who has
 * NOT completed onboarding, mid-wizard, which no fixture produces. So every
 * pair on this page has been unmeasured since it was written. This file reads
 * the literals out of the source and computes them, so a hex typed into that
 * page in future is checked even though the walk still cannot see it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..');

/** The composited card: `rgba(30,41,59,0.8)` over the `#0f172a → #1e293b`
 *  gradient. Taken at the darker end, which is the harder case. */
const CARD = '#1b2537';
/** The inner translucent card the orientation screens use for panels. */
const INNER = '#242e40';

function luminance(hex: string): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const FILES = [
  ['pages/Onboarding.tsx', CARD],
  ['components/onboarding/Orientation.tsx', INNER],
  ['components/onboarding/BaseCamp.tsx', INNER],
] as const;

/** Six-digit hex literals used as a colour in the file. */
function hexes(source: string): string[] {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return [...new Set(stripped.match(/#[0-9a-fA-F]{6}\b/g) ?? [])];
}

describe('the onboarding shell', () => {
  it.each(FILES)('%s uses no theme text token on the fixed dark card', (file) => {
    const source = readFileSync(join(SRC, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    // *** THE RULE, NOT A LIST OF KNOWN-BAD LINES. *** `--text-primary` and
    // `--text-secondary` and `--text-muted` all invert with the theme, and this
    // shell does not, so any of them here is the same defect.
    expect(source).not.toMatch(/var\(--text-(primary|secondary|muted)\)/);
  });

  it.each(FILES)('%s: every colour literal is legible on that card', (file, surface) => {
    const found = hexes(readFileSync(join(SRC, file), 'utf8'));
    expect(found.length).toBeGreaterThan(0);

    /*
     * Surfaces, not ink — excluded BY VALUE rather than by guessing at where
     * each literal is used, because a scan cannot tell a background from a
     * colour without parsing the JSX. Each one is a fill this page paints
     * something else on top of:
     *   #0f172a #1e293b  the page gradient
     *   #1b2537 #242e40  the composited cards (the surfaces being measured)
     *   #15803d #166534  the brand button gradient — white on it is 5.02:1
     *   #fbbf24          the gold in the header gradient, which carries no text
     * Adding to this list is how a contrast failure could be waved through, so
     * a new entry needs a reason on the line beside it.
     */
    const SURFACES = new Set([
      '#0f172a', '#1e293b', '#1b2537', '#242e40', '#15803d', '#166534', '#fbbf24',
    ]);

    for (const hex of found) {
      if (SURFACES.has(hex.toLowerCase())) continue;
      const measured = ratio(hex, surface);
      // 3:1 is the non-text floor; anything used as body text in these files is
      // asserted at AA by the named-role test below.
      expect(measured, `${hex} on ${surface} in ${file}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('the named roles the orientation screens use are AA on the inner card', () => {
    // These four are declared as consts in Orientation.tsx and BaseCamp.tsx.
    const roles: Array<[string, string]> = [
      ['INK', '#ffffff'],
      ['BODY', '#cbd5e1'],
      ['MUTED', '#94a3b8'],
    ];
    for (const [name, hex] of roles) {
      expect(ratio(hex, INNER), `${name} (${hex})`).toBeGreaterThanOrEqual(4.5);
    }
    // The accent is used for glyphs and the dot strip — non-text, 3:1.
    expect(ratio('#86efac', INNER)).toBeGreaterThanOrEqual(3);
  });

  it('the page prints no step counter and no percentage', () => {
    /*
     * *** SPEC §10.5: A DOT STRIP, NOT "STEP 2 OF 4". *** A wizard counter is
     * still a denominator finPal chose, and `50%` is a score for filling in a
     * form — on a flow whose own copy promises "no score you did not ask for".
     * The `aria-label` keeps the position for a screen reader, which is why
     * this checks the RENDERED strings rather than banning the words outright.
     */
    const source = readFileSync(join(SRC, 'pages', 'Onboarding.tsx'), 'utf8');
    expect(source).not.toMatch(/>\s*Step \{step\} of 4/);
    expect(source).not.toMatch(/Math\.round\(\(step \/ 4\) \* 100\)/);
  });
});
