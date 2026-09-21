/**
 * Every `var(--x)` the app renders must resolve to a declaration in a
 * stylesheet the app actually imports.
 *
 * *** THIS IS `cssClassesAreDefined.test.ts`'s TWIN, AND THE GAP BETWEEN THEM
 * SHIPPED A TYPO TO TWO FILES. *** That gate exists for D-60: a Tailwind-shaped
 * class resolves to no rule at all and renders silently unstyled. The identical
 * problem for a custom property was unguarded, and `var(--accent-primary)` — a
 * token with **zero occurrences in `finpal-theme.css`** — sat in the tree in two
 * places until 2026-09-16.
 *
 * *** ONE TYPO, TWO FILES, TWO COMPLETELY DIFFERENT SYMPTOMS, WHICH IS WHY A
 * VISUAL CHECK WOULD NEVER HAVE FOUND BOTH. ***
 *
 *   `NotFound.tsx`   used it as `background`. An undefined property makes the
 *                    declaration invalid at computed-value time, and
 *                    `background` is NOT inherited, so it fell back to
 *                    `transparent` — `color: 'white'` on the page, **1.03:1**.
 *                    Loud. The contrast walk caught it the day the page joined
 *                    the capture.
 *
 *   `GoalAccountsControl.tsx` used it as `color`, which IS inherited — so the
 *                    button quietly took its parent's ink and the accent simply
 *                    never applied. Silent. Legible, therefore invisible to
 *                    every contrast gate by construction: there is nothing
 *                    wrong with the colour it ended up with.
 *
 * The second one is the reason this file is a source gate rather than a visual
 * one. "The styling did nothing" has no rendered symptom to measure.
 *
 * Asserted in one direction only, for the same reason the class gate is:
 *   used-but-not-defined  -> the declaration does nothing. A defect.
 *   defined-but-not-used  -> dead token. Untidy, not wrong, and true of plenty
 *                            of the palette by design.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SRC = resolve(process.cwd(), 'src');

function walk(dir: string, hit: (file: string) => void): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, hit);
    else hit(full);
  }
}

/** Source files that ship to the browser. Tests do not render. */
function sourceFiles(): string[] {
  const files: string[] = [];
  walk(SRC, (f) => {
    if (!/\.tsx?$/.test(f)) return;
    if (f.includes('__tests__')) return;
    files.push(f);
  });
  return files;
}

/**
 * Stylesheets reachable by an `import './x.css'` from a source file.
 *
 * Discovered by scanning rather than hardcoded, and that is load-bearing:
 * `src/App.css` is a Vite-template leftover nothing imports, so counting its
 * declarations as defined would let this gate certify a token that resolves to
 * nothing — the exact failure it exists to catch.
 */
function importedStylesheets(files: string[]): string[] {
  const sheets = new Set<string>();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const [, spec] of source.matchAll(/import\s+['"]([^'"]+\.css)['"]/g)) {
      sheets.add(resolve(dirname(file), spec));
    }
  }
  return [...sheets];
}

const COMMENTS = /\/\*[\s\S]*?\*\//g;
/** A custom-property DECLARATION: `--name:` at the start of a declaration. */
const DECLARATION = /(--[A-Za-z0-9_-]+)\s*:/g;
/**
 * A custom-property USE, and whether it supplied a FALLBACK.
 *
 * *** `var(--x, #ef4444)` IS NOT THE DEFECT AND MUST NOT BE REPORTED AS ONE. ***
 * A fallback is the author saying "this token may not exist here", and it
 * renders the fallback — nothing is silent and nothing is unstyled. Two live
 * sites rely on that deliberately: `Review.tsx` reads `--coin-gold`, which is
 * defined on `feat/coins-and-gear` and not on `main`, and does so with the hex
 * beside it precisely so the page works either way.
 *
 * Failing those would make this gate wrong, and a gate that is wrong about two
 * of its ten findings is a gate that gets a blanket exemption added to it. So
 * the capture group keeps the comma: no comma means no fallback means silent.
 */
const USE = /var\(\s*(--[A-Za-z0-9_-]+)\s*(,?)/g;

function definedInStylesheets(sheets: string[]): Set<string> {
  const defined = new Set<string>();
  for (const sheet of sheets) {
    const css = readFileSync(sheet, 'utf8').replace(COMMENTS, '');
    for (const [, name] of css.matchAll(DECLARATION)) defined.add(name);
  }
  return defined;
}

/**
 * Tokens a `.tsx` file uses, minus the ones it declares itself.
 *
 * A component may set a custom property inline — `style={{ '--x': v }}` — and
 * read it back in the same subtree. That is a real pattern and is not a missing
 * token, so a name declared anywhere in the same file counts as defined.
 * Comments are stripped first: several files EXPLAIN `var(--accent-primary)` in
 * prose now, and a gate that matches its own explanation is the mistake the
 * category-icon guard and D-234 both made.
 */
function usedInSource(files: string[]): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>();
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
      .replace(COMMENTS, '')
      .replace(/\/\/[^\n]*/g, '');
    const declaredHere = new Set(
      [...source.matchAll(/['"](--[A-Za-z0-9_-]+)['"]\s*:/g)].map((m) => m[1]),
    );
    const found = new Set<string>();
    for (const [, name, comma] of source.matchAll(USE)) {
      if (declaredHere.has(name)) continue;
      if (comma === ',') continue;  // has a fallback; renders it
      found.add(name);
    }
    if (found.size) used.set(relative(SRC, file), found);
  }
  return used;
}

const FILES = sourceFiles();
const SHEETS = importedStylesheets(FILES);
const DEFINED = definedInStylesheets(SHEETS);
const USED = usedInSource(FILES);

describe('the sweep actually swept', () => {
  it('found source files, an imported stylesheet, and tokens in both', () => {
    // Guards the guard. Every assertion below passes vacuously on empty sets,
    // which is how the module-slug regex in `every-page.spec.ts` stopped
    // exempting anything without anyone noticing.
    expect(FILES.length).toBeGreaterThan(100);
    expect(SHEETS.length).toBeGreaterThan(0);
    expect(DEFINED.size).toBeGreaterThan(100);
    expect(USED.size).toBeGreaterThan(50);
  });

  it('knows the tokens this app is actually built on', () => {
    for (const token of ['--text-primary', '--bg-primary', '--g-ink', '--g-wash']) {
      expect(DEFINED.has(token), `${token} should be defined`).toBe(true);
    }
  });

  it('reproduces the defect: the token that was used twice is not defined', () => {
    // If this ever stops being true the token was added, and THAT is the moment
    // to decide whether it should exist — not silently, by a third file using it.
    expect(DEFINED.has('--accent-primary')).toBe(false);
  });
});

describe('a var() with a fallback is deliberate, not a finding', () => {
  it('reads the fallback form as fine, and the bare form as broken', () => {
    // The distinction this gate turns on, asserted rather than assumed — and
    // asserted on the exact two shapes in the tree.
    const withFallback = "color: 'var(--error-color, #ef4444)'";
    const without = "background: 'var(--card-bg)'";
    const names = (src: string) => [...src.matchAll(USE)]
      .filter((m) => m[2] !== ',').map((m) => m[1]);
    expect(names(withFallback)).toEqual([]);
    expect(names(without)).toEqual(['--card-bg']);
  });

  it('names the two tokens that are read with a fallback on purpose', () => {
    // `--coin-gold` is defined on `feat/coins-and-gear` and not on main;
    // `Review.tsx` reads it with the hex beside it so the page works either
    // way. Listed so that branch landing does not look like a new finding.
    const review = readFileSync(join(SRC, 'pages/Review.tsx'), 'utf8');
    expect(review).toContain('var(--coin-gold, #8A6A2F)');
  });
});

describe('every var(--x) resolves to a declaration', () => {
  it('has no undefined custom properties in any source file', () => {
    const offenders: string[] = [];
    for (const [file, tokens] of USED) {
      for (const token of tokens) {
        if (!DEFINED.has(token)) offenders.push(`${file}: ${token}`);
      }
    }
    expect(
      offenders.sort(),
      'these resolve to nothing — an undefined custom property makes the '
        + 'declaration invalid at computed-value time, which is silent for an '
        + 'inherited property and a fallback-to-initial for everything else',
    ).toEqual([]);
  });
});
