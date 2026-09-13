/**
 * *** YOU CANNOT APPEND AN ALPHA SUFFIX TO A COLOUR YOU DID NOT WRITE. ***
 *
 * `#3b82f6` + `'33'` is a valid eight-digit hex. `var(--accent-blue)` + `'33'`
 * is not: CSS substitutes variables on the TOKEN stream, so the declaration
 * becomes `#3b82f6 33` — two component values — and the browser drops it whole.
 * Nothing warns. The element simply renders with no background.
 *
 * *** THIS PROJECT HAS SHIPPED THAT BUG TWICE. ***
 *
 *   1. `pages/Accounts.tsx`, `${account.color}20` — documented at length in
 *      `accountSwatchContrast.test.ts`, and only found because FIXING the
 *      colour map made the tint render for the first time and the contrast walk
 *      immediately reported a new failing pair.
 *   2. `StatCard`, `accentColor + '33'` and `accentColor + '66'` — D-196. Eight
 *      call sites pass a variable, so five pages rendered flat icon wells for as
 *      long as the accents have been tokens.
 *
 * A type cannot catch it: both halves are strings and the result is a string.
 * A unit test cannot catch it: nothing asserts on a wash. The contrast walk is
 * the only gate that could, and only by accident — it reads the COMPUTED
 * background, so an absent wash shows up as "measured against the card".
 *
 * So this is the guard, and it is keyed to the SHAPE rather than to a spelling:
 * appending a hex-pair to any identifier whose name says it holds a colour.
 *
 * *** THE FIX IS ALWAYS `color-mix`. *** `color-mix(in srgb, <c> 20%, transparent)`
 * takes a hex and a variable alike, and 20% / 40% are exactly what `33` / `66`
 * meant.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(process.cwd(), 'src');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
};

/**
 * *** STRIP COMMENTS FIRST. *** The files that document this bug spell the
 * forbidden shape out in prose — including this one. A guard that trips on its
 * own explanation gets deleted rather than obeyed.
 */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** `accentColor + '33'`, `color + "20"` — concatenation. */
const CONCAT = /\b(\w*[Cc]olou?r)\s*\+\s*['"][0-9a-fA-F]{2}['"]/g;
/** `${account.color}20` — interpolation inside a template literal. */
const INTERP = /\$\{[^}]*\b\w*[Cc]olou?r\b[^}]*\}[0-9a-fA-F]{2}\b/g;

describe('an alpha suffix is never appended to a colour value', () => {
  const offenders: string[] = [];

  for (const file of walk(SRC)) {
    // The test files that DOCUMENT the bug are allowed to name it; they render
    // nothing. Everything that can reach a browser is in scope.
    if (file.includes('__tests__')) continue;
    const src = code(readFileSync(file, 'utf8'));
    for (const re of [CONCAT, INTERP]) {
      re.lastIndex = 0;
      for (const m of src.matchAll(re)) {
        offenders.push(`${file.replace(SRC, 'src')}: ${m[0]}`);
      }
    }
  }

  it('finds none — use color-mix(in srgb, <colour> N%, transparent)', () => {
    expect(offenders).toEqual([]);
  });

  it('*** CAN SEE BOTH SHAPES *** — proven on strings, not assumed', () => {
    // A guard nobody has watched fail is a guard nobody should trust. These are
    // the two real historical defects, verbatim.
    expect("background: accentColor + '33',".match(CONCAT)).toBeTruthy();
    expect('background: `${account.color}20`,'.match(INTERP)).toBeTruthy();
    // And it does NOT fire on the legitimate forms.
    expect("background: color-mix(in srgb, accentColor 20%, transparent)".match(CONCAT))
      .toBeNull();
    expect('background: `${account.color}`,'.match(INTERP)).toBeNull();
  });
});
