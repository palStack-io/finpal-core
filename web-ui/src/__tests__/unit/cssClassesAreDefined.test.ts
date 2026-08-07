/**
 * Every `className` the app renders must resolve to a rule in a stylesheet the
 * app actually imports.
 *
 * D-60. Removing the Tailwind toolchain left `opacity-25` and `opacity-75` on
 * Button's spinner SVG. They look exactly like the four utilities that WERE
 * hand-defined in index.css (.animate-spin, .animate-in, .slide-in-from-right,
 * .animate-pulse), so nothing about reading the file said they were dead — and a
 * class that resolves to no rule is silent. No error, no warning, no build
 * failure; the element just renders unstyled.
 *
 * Keyed to the MECHANISM (set difference over the whole tree) rather than to a
 * list of known-bad names, because the bug is "somebody forgot one" and a list
 * is a list of the ones somebody remembered — D-59, in a different file.
 *
 * Two directions were considered and only one is a defect:
 *   used-but-not-defined  -> renders unstyled. Asserted here.
 *   defined-but-not-used  -> dead CSS. Untidy, not wrong, and currently true of
 *                            the shell vocabulary (.fp-card, .page-title, ...)
 *                            that U-03 exists to reconnect. Not asserted.
 *
 * The DEFINED set comes from the stylesheets that are `import`ed from source,
 * discovered by scanning, not from a hardcoded pair of paths. src/App.css is a
 * Vite-template leftover that nothing imports: counting its `.card` as defined
 * would let this gate certify a class that renders unstyled, which is the exact
 * failure it exists to catch.
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

/** Stylesheets reachable by an `import './x.css'` from a source file. */
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
/** Everything before a `{` is selector text; a class token starts with a letter. */
const SELECTOR_PRELUDE = /([^{}]*)\{/g;
const CLASS_TOKEN = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g;

function definedClasses(sheets: string[]): Set<string> {
  const defined = new Set<string>();
  for (const sheet of sheets) {
    const css = readFileSync(sheet, 'utf8').replace(COMMENTS, '');
    for (const [, prelude] of css.matchAll(SELECTOR_PRELUDE)) {
      for (const [, name] of prelude.matchAll(CLASS_TOKEN)) defined.add(name);
    }
  }
  return defined;
}

/**
 * Reads the value of every `className=` in a file.
 *
 * `className="a b"` yields both tokens. `className={...}` is an arbitrary
 * expression, so the static fragments are harvested instead: template-literal
 * text with `${...}` holes removed, plus quoted strings. That covers the two
 * live shapes — `` `nav-item ${isActive ? 'active' : ''}` `` and a bare
 * `className={className}` passthrough, which contributes nothing and should.
 */
function usedClasses(files: string[]): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>();

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const found = new Set<string>();

    for (const [, literal] of source.matchAll(/className\s*=\s*"([^"]*)"/g)) {
      for (const token of literal.split(/\s+/)) if (token) found.add(token);
    }

    for (const match of source.matchAll(/className\s*=\s*\{/g)) {
      const expression = braced(source, match.index! + match[0].length - 1);
      if (expression === null) continue;
      const statics = expression
        .replace(/\$\{[^{}]*\}/g, ' ')
        .match(/`[^`]*`|'[^']*'|"[^"]*"/g);
      for (const chunk of statics ?? []) {
        for (const token of chunk.slice(1, -1).split(/\s+/)) if (token) found.add(token);
      }
    }

    if (found.size) used.set(relative(SRC, file), found);
  }
  return used;
}

/** Text inside the braces starting at `open`, or null if unbalanced. */
function braced(source: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  return null;
}

describe('every rendered className resolves to a rule', () => {
  const files = sourceFiles();
  const sheets = importedStylesheets(files);
  const defined = definedClasses(sheets);
  const used = usedClasses(files);

  it('finds the stylesheets and the classNames, so a pass means something', () => {
    // A gate that inspects nothing looks exactly like a gate that passes.
    expect(files.length).toBeGreaterThan(50);
    expect(sheets.length).toBeGreaterThan(0);
    expect(defined.size).toBeGreaterThan(20);
    expect([...used.values()].reduce((n, s) => n + s.size, 0)).toBeGreaterThan(10);
  });

  it('never counts a stylesheet that nothing imports', () => {
    // src/App.css defines .card and is imported by no one.
    expect(sheets.some((s) => s.endsWith('App.css'))).toBe(false);
    expect(defined.has('card')).toBe(false);
  });

  it('leaves no className without a rule', () => {
    const orphans: string[] = [];
    for (const [file, classes] of used) {
      for (const name of classes) {
        if (!defined.has(name)) orphans.push(`${name}  (${file})`);
      }
    }
    expect(orphans.sort(), [
      'These classNames resolve to no rule in any imported stylesheet, so the',
      'elements carrying them render unstyled. Either define the rule or, if it',
      'was a Tailwind utility, express it inline — see the comment at the top of',
      'src/index.css for why re-adding a Tailwind-shaped class is the wrong fix.',
    ].join('\n')).toEqual([]);
  });
});
